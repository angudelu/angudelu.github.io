import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import tempfile
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
COMMENTS_FILE = ROOT / "comentarios.txt"
USERS_FILE = ROOT / "usuarios.txt"
POST_VOTES_FILE = ROOT / "post-votes.json"
MAX_REQUEST_BYTES = 4096
MAX_CREDENTIALS_LENGTH = 160
MAX_USERNAME_LENGTH = 60
MAX_COMMENT_LENGTH = 280
MAX_COMMENT_LINE_BREAKS = 3
PASSWORD_HASH_ITERATIONS = 600_000
comments_lock = threading.Lock()
users_lock = threading.Lock()
post_votes_lock = threading.Lock()
MAX_COMMENTS_PER_DAY = 5
INVALID_CREDENTIALS_MESSAGE = (
    "Tienes que escribirme a mí para conseguir un usuario y contraseña "
    "y así poder comentar."
)
INVALID_RECIPIENT_MESSAGE = "destinatario no existente"
MISSING_PASSWORD_MESSAGE = (
    'Introduce el usuario y la contraseña separados por dos puntos (:), por ejemplo '
    '"usuario:contraseña".'
)
INCORRECT_PASSWORD_MESSAGE = "La contraseña es incorrecta."
UNKNOWN_USER_MESSAGE = "Usuario no existente. Comprueba el nombre o contacta con Andrés para conseguir una cuenta."


def validate_comment_replies(replies):
    if not isinstance(replies, list) or any(
        not isinstance(reply, dict)
        or not isinstance(reply.get("id"), str)
        or not isinstance(reply.get("username"), str)
        or not isinstance(reply.get("text"), str)
        or not isinstance(reply.get("icon"), int)
        or isinstance(reply.get("icon"), bool)
        or not 1 <= reply["icon"] <= 5
        or not isinstance(reply.get("angle"), int)
        or isinstance(reply.get("angle"), bool)
        or not -30 <= reply["angle"] <= 30
        for reply in replies
    ):
        raise ValueError("Invalid saved replies data")
    return replies


def count_line_breaks(text):
    return len(re.findall(r"\r\n|\r|\n", text))


def read_post_votes_unlocked():
    if not POST_VOTES_FILE.exists():
        return []
    with POST_VOTES_FILE.open("r", encoding="utf-8") as file:
        votes = json.load(file)
    if not isinstance(votes, list) or any(
        not isinstance(vote, dict)
        or not isinstance(vote.get("postId"), str)
        or not isinstance(vote.get("username"), str)
        or not isinstance(vote.get("author"), str)
        or type(vote.get("vote")) is not int
        or vote["vote"] not in (-1, 1)
        for vote in votes
    ):
        raise ValueError("Invalid saved post votes")
    return votes


def load_post_votes():
    with post_votes_lock:
        return read_post_votes_unlocked()


def calculate_account_points(records, username, post_votes=None):
    if post_votes is None:
        post_votes = load_post_votes()
    replies_received = 0
    comment_cost = 0
    for record in records:
        if record.get("name") != username or record.get("private") or record.get("deleted"):
            continue
        edited_at = record.get("editedAt") or record.get("edited")
        comment_cost += 1.5 if edited_at else 1
        replies_received += sum(
            reply["username"] != username
            for reply in validate_comment_replies(record.get("replies", []))
        )
    vote_points = sum(
        5 if vote["vote"] == 1 else -2
        for vote in post_votes
        if vote["author"] == username
    )
    return round(25 + replies_received - comment_cost + vote_points, 2)


def find_color_post_author(post_id):
    match = re.fullmatch(
        r"(magenta|amarillo|cian|negro):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):(\d{1,6})",
        post_id,
    )
    if not match:
        raise ValueError("Identificador de publicación no válido.")
    color, date_time, requested_occurrence = match.groups()
    requested_occurrence = int(requested_occurrence)
    post_file = ROOT / color / f"texto-{color}.txt"
    contents = post_file.read_text(encoding="utf-8")
    entry_pattern = re.compile(
        r"^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?\|", re.MULTILINE
    )
    entries = list(entry_pattern.finditer(contents))
    occurrence = 0
    for index, entry in enumerate(entries):
        normalized_date, hour, minute = entry.group(1), entry.group(2) or "00", entry.group(3) or "00"
        if f"{normalized_date}T{hour}:{minute}" != date_time:
            continue
        if occurrence != requested_occurrence:
            occurrence += 1
            continue
        content_end = entries[index + 1].start() if index + 1 < len(entries) else len(contents)
        body = contents[entry.end():content_end].strip()
        author = re.match(r"@([^|\r\n]{1,60})\|", body)
        return author.group(1).strip() if author else ""
    raise ValueError("No se encontró la publicación indicada.")


def summarize_post_votes(post_votes):
    summaries = {}
    for vote in post_votes:
        summary = summaries.setdefault(vote["postId"], {"likes": 0, "dislikes": 0})
        summary["likes" if vote["vote"] == 1 else "dislikes"] += 1
    return summaries


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        request_path = unquote(urlsplit(self.path).path).replace("\\", "/")
        if request_path.rsplit("/", 1)[-1].casefold() in {
            USERS_FILE.name.casefold(),
            COMMENTS_FILE.name.casefold(),
            POST_VOTES_FILE.name.casefold(),
        }:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if request_path == "/api/posts/votes":
            try:
                self.send_json(HTTPStatus.OK, {"votes": summarize_post_votes(load_post_votes())})
            except (OSError, ValueError, json.JSONDecodeError) as error:
                self.log_error("Could not read post votes: %s", error)
                self.send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "No se pudieron leer los votos de las publicaciones."},
                )
            return
        if request_path == "/api/comments":
            try:
                self.send_json(HTTPStatus.OK, {"comments": self.read_comment_list()})
            except (OSError, ValueError, KeyError) as error:
                self.log_error("Could not read comments: %s", error)
                self.send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "No se pudieron leer los comentarios guardados."},
                )
            return
        super().do_GET()

    def read_comment_list(self, viewer_username=None):
        comments = []
        with comments_lock:
            if not COMMENTS_FILE.exists():
                return comments
            with COMMENTS_FILE.open("r", encoding="utf-8") as file:
                records = []
                for line_number, line in enumerate(file, start=1):
                    if not line.strip() or line.lstrip().startswith("#"):
                        continue
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError as error:
                        raise ValueError(
                            f"Invalid comment data on line {line_number}"
                        ) from error

            post_votes = load_post_votes()
            usernames = {
                record.get("name", "") for record in records
            } | {vote["author"] for vote in post_votes}
            author_points = {
                username: calculate_account_points(records, username, post_votes)
                for username in usernames
                if username
            }

            for saved_comment in records:
                is_private = bool(saved_comment.get("private"))
                if is_private and (
                    not viewer_username or
                    viewer_username not in {
                        saved_comment.get("name"),
                        saved_comment.get("recipient"),
                    }
                ):
                    continue

                edited_at = saved_comment.get("editedAt") or (
                    saved_comment.get("edited")
                    if isinstance(saved_comment.get("edited"), str)
                    else ""
                )
                comment = {
                    "date": saved_comment["date"],
                    "requestId": saved_comment["requestId"],
                    "deleted": bool(saved_comment.get("deleted")),
                    "private": is_private,
                    "name": saved_comment["name"],
                    "authorPoints": author_points.get(saved_comment.get("name"), 25),
                }
                if is_private or not saved_comment.get("deleted"):
                    comment["edited"] = bool(edited_at)
                    comment["editedAt"] = edited_at
                    if is_private:
                        comment["recipient"] = saved_comment.get("recipient", "")
                if not saved_comment.get("deleted"):
                    comment["comment"] = saved_comment["comment"]
                    comment["replies"] = validate_comment_replies(
                        saved_comment.get("replies", [])
                    )
                comments.append(comment)
        return list(reversed(comments))

    def get_account_points(self, username):
        with comments_lock:
            if COMMENTS_FILE.exists():
                with COMMENTS_FILE.open("r", encoding="utf-8") as file:
                    records = [
                        json.loads(line)
                        for line in file
                        if line.strip() and not line.lstrip().startswith("#")
                    ]
            else:
                records = []
        return calculate_account_points(records, username)

    def load_users(self):
        with users_lock:
            with USERS_FILE.open("r", encoding="utf-8") as file:
                entries = {}
                for line_number, line in enumerate(file, start=1):
                    if not line.strip() or line.lstrip().startswith("#"):
                        continue
                    fields = line.rstrip("\r\n").split(":")
                    if len(fields) != 3 or not fields[0]:
                        raise ValueError(f"Invalid user entry on line {line_number}")
                    entries[fields[0]] = (bytes.fromhex(fields[1]), fields[2])
        return entries

    def verify_credentials(self, credentials):
        username, separator, password = credentials.partition(":")
        if not separator:
            username = credentials

        if not username or len(username) > MAX_USERNAME_LENGTH or not password:
            return None, MISSING_PASSWORD_MESSAGE
        try:
            entries = self.load_users()
        except OSError as error:
            self.log_error("Could not read users file: %s", error)
            raise

        entry = entries.get(username)
        if entry is None:
            return None, UNKNOWN_USER_MESSAGE

        salt, expected_hash = entry
        actual_hash = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
        ).hex()
        if not hmac.compare_digest(actual_hash, expected_hash):
            return None, INCORRECT_PASSWORD_MESSAGE
        return username, None

    def do_POST(self):
        request_path = urlsplit(self.path).path
        if request_path not in {
            "/api/posts/vote",
            "/api/comments",
            "/api/comments/login",
            "/api/comments/list",
            "/api/comments/unlock",
            "/api/comments/edit",
            "/api/comments/delete",
            "/api/comments/reply",
        }:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Solicitud no válida."})
            return

        if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
            self.send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"error": "El comentario enviado es demasiado grande."},
            )
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "El formato del comentario no es válido."})
            return

        if not isinstance(payload, dict):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "El comentario no es válido."})
            return

        if request_path == "/api/posts/vote":
            self.vote_on_post(payload)
            return
        if request_path == "/api/comments/login":
            credentials = payload.get("credentials")
            if not isinstance(credentials, str) or len(credentials) > MAX_CREDENTIALS_LENGTH:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": MISSING_PASSWORD_MESSAGE})
                return
            try:
                username, authentication_error = self.verify_credentials(credentials.strip())
            except (OSError, ValueError) as error:
                self.log_error("Could not verify login credentials: %s", error)
                self.send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "No se pudo iniciar sesión. Inténtalo más tarde."},
                )
                return
            if authentication_error:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": authentication_error})
                return
            self.send_json(HTTPStatus.OK, {"username": username})
            return

        if request_path == "/api/comments/list":
            username = payload.get("username")
            password = payload.get("password")
            if not isinstance(username, str) or not isinstance(password, str):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": MISSING_PASSWORD_MESSAGE})
                return
            if len(username) + len(password) + 1 > MAX_CREDENTIALS_LENGTH:
                self.send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"error": "El usuario y la contraseña superan el límite permitido."},
                )
                return
            try:
                verified_username, authentication_error = self.verify_credentials(
                    f"{username}:{password}"
                )
            except (OSError, ValueError) as error:
                self.log_error("Could not verify comment list credentials: %s", error)
                self.send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "No se pudieron cargar los comentarios."},
                )
                return
            if authentication_error:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": authentication_error})
                return
            try:
                comments = self.read_comment_list(verified_username)
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "comments": comments,
                        "accountPoints": self.get_account_points(verified_username),
                    },
                )
            except (OSError, ValueError, KeyError) as error:
                self.log_error("Could not read authenticated comments: %s", error)
                self.send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "No se pudieron cargar los comentarios."},
                )
            return

        if request_path == "/api/comments/unlock":
            self.unlock_comment(payload)
            return
        if request_path in {"/api/comments/edit", "/api/comments/delete"}:
            self.manage_comment(payload, request_path.rsplit("/", 1)[-1])
            return
        if request_path == "/api/comments/reply":
            self.add_comment_reply(payload)
            return

        credentials = payload.get("name")
        comment_text = payload.get("comment")
        if not isinstance(credentials, str) or not isinstance(comment_text, str):
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": INVALID_CREDENTIALS_MESSAGE})
            return

        credentials = credentials.strip()
        comment_text = comment_text.strip()
        if len(credentials) > MAX_CREDENTIALS_LENGTH:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": INVALID_CREDENTIALS_MESSAGE})
            return
        at_index = credentials.rfind("@")
        recipient = credentials[at_index + 1:].strip() if at_index >= 0 else ""
        recipient_provided = payload.get("recipientProvided") is True or at_index >= 0
        sender_credentials = credentials[:at_index] if at_index >= 0 else credentials

        try:
            username, authentication_error = self.verify_credentials(sender_credentials)
            if not authentication_error and recipient_provided and (
                not recipient or recipient not in self.load_users()
            ):
                authentication_error = INVALID_RECIPIENT_MESSAGE
        except (OSError, ValueError) as error:
            self.log_error("Could not verify comment credentials: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo verificar el usuario. Inténtalo más tarde."},
            )
            return
        if authentication_error:
            status = (
                HTTPStatus.BAD_REQUEST
                if authentication_error == INVALID_RECIPIENT_MESSAGE
                else HTTPStatus.UNAUTHORIZED
            )
            self.send_json(status, {"error": authentication_error})
            return

        if not comment_text:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Escribe un comentario."})
            return
        if len(comment_text.encode("utf-16-le")) // 2 > MAX_COMMENT_LENGTH:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "El comentario admite hasta 280 caracteres."},
            )
            return
        if count_line_breaks(comment_text) > MAX_COMMENT_LINE_BREAKS:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "El comentario admite como máximo 3 saltos de línea."},
            )
            return

        new_comment = {
            "date": datetime.now().astimezone().isoformat(timespec="seconds"),
            "name": username,
            "comment": comment_text,
            "private": recipient_provided,
        }
        if recipient_provided:
            new_comment["recipient"] = recipient
        request_id = payload.get("requestId")
        new_comment["requestId"] = (
            request_id if isinstance(request_id, str) and request_id
            else os.urandom(16).hex()
        )
        try:
            with comments_lock:
                today = datetime.now().astimezone().date()
                comments_today = 0
                records = []
                if COMMENTS_FILE.exists():
                    with COMMENTS_FILE.open("r", encoding="utf-8") as file:
                        for line in file:
                            if not line.strip() or line.lstrip().startswith("#"):
                                continue
                            saved_comment = json.loads(line)
                            records.append(saved_comment)
                            saved_date = datetime.fromisoformat(saved_comment["date"]).date()
                            if saved_comment["name"] == username and saved_date == today:
                                comments_today += 1
                points = calculate_account_points(records, username)
                if points < 1:
                    self.send_json(
                        HTTPStatus.FORBIDDEN,
                        {
                            "error": "No tienes puntos suficientes para comentar. Borra uno de tus comentarios para recuperar puntos.",
                            "accountPoints": points,
                        },
                    )
                    return
                if comments_today >= MAX_COMMENTS_PER_DAY:
                    self.send_json(
                        HTTPStatus.TOO_MANY_REQUESTS,
                        {"error": "Has alcanzado el límite de 5 comentarios por día."},
                    )
                    return
                with COMMENTS_FILE.open("a", encoding="utf-8") as file:
                    file.write(json.dumps(new_comment, ensure_ascii=False) + "\n")
        except (OSError, KeyError, ValueError, json.JSONDecodeError) as error:
            self.log_error("Could not save comment: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo guardar el comentario. Inténtalo más tarde."},
            )
            return

        public_comment = {
            "date": new_comment["date"],
            "name": username,
            "requestId": new_comment["requestId"],
            "private": new_comment["private"],
        }
        if new_comment["private"]:
            public_comment["recipient"] = recipient
        else:
            public_comment["comment"] = comment_text
        self.send_json(HTTPStatus.CREATED, {"comment": public_comment})

    def vote_on_post(self, payload):
        username = payload.get("username")
        password = payload.get("password")
        post_id = payload.get("postId")
        vote_value = payload.get("vote")
        if (
            not isinstance(username, str)
            or not isinstance(password, str)
            or not isinstance(post_id, str)
            or type(vote_value) is not int
            or vote_value not in (-1, 1)
            or len(username) + len(password) + 1 > MAX_CREDENTIALS_LENGTH
        ):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": MISSING_PASSWORD_MESSAGE})
            return
        username = username.strip()
        try:
            verified_username, authentication_error = self.verify_credentials(
                f"{username}:{password}"
            )
        except (OSError, ValueError) as error:
            self.log_error("Could not verify post vote credentials: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo verificar el usuario. Inténtalo más tarde."},
            )
            return
        if authentication_error:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": authentication_error})
            return

        try:
            author = find_color_post_author(post_id)
            if author and author not in self.load_users():
                self.send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"error": "La cuenta asociada a esta publicación no existe."},
                )
                return
            with post_votes_lock:
                votes = []
                if POST_VOTES_FILE.exists():
                    votes = read_post_votes_unlocked()
                existing = next(
                    (
                        item for item in votes
                        if item.get("postId") == post_id and item.get("username") == verified_username
                    ),
                    None,
                )
                if existing:
                    existing["vote"] = vote_value
                    existing["author"] = author
                else:
                    votes.append({
                        "postId": post_id,
                        "username": verified_username,
                        "author": author,
                        "vote": vote_value,
                    })
                temporary_path = None
                try:
                    with tempfile.NamedTemporaryFile(
                        mode="w",
                        encoding="utf-8",
                        dir=POST_VOTES_FILE.parent,
                        prefix=POST_VOTES_FILE.name + ".",
                        suffix=".tmp",
                        delete=False,
                    ) as temporary:
                        json.dump(votes, temporary, ensure_ascii=False)
                        temporary_path = Path(temporary.name)
                    os.replace(temporary_path, POST_VOTES_FILE)
                finally:
                    if temporary_path and temporary_path.exists():
                        temporary_path.unlink()
                summary = summarize_post_votes(votes).get(
                    post_id, {"likes": 0, "dislikes": 0}
                )
            self.send_json(
                HTTPStatus.OK,
                {
                    "votes": summary,
                    "accountPoints": self.get_account_points(verified_username),
                    "postAuthorPoints": self.get_account_points(author) if author else None,
                    "message": "Voto guardado. No se han modificado puntos."
                    if not author else "Voto guardado.",
                },
            )
        except (OSError, ValueError, json.JSONDecodeError) as error:
            self.log_error("Could not save post vote: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo guardar el voto. Inténtalo más tarde."},
            )

    def unlock_comment(self, payload):
        credentials = payload.get("credentials")
        request_id = payload.get("requestId")
        if not isinstance(credentials, str) or not isinstance(request_id, str):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Solicitud no válida."})
            return
        try:
            username, authentication_error = self.verify_credentials(credentials.strip())
            if authentication_error:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": authentication_error})
                return
            with comments_lock:
                if not COMMENTS_FILE.exists():
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "No se encontró el comentario privado."})
                    return
                with COMMENTS_FILE.open("r", encoding="utf-8") as file:
                    private_comment = None
                    for line in file:
                        if not line.strip() or line.lstrip().startswith("#"):
                            continue
                        record = json.loads(line)
                        if (
                            record.get("requestId") == request_id
                            and record.get("private")
                            and not record.get("deleted")
                        ):
                            private_comment = record
                            break
            if private_comment is None:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "No se encontró el comentario privado."})
                return
            if username not in {private_comment["name"], private_comment["recipient"]}:
                self.send_json(HTTPStatus.FORBIDDEN, {"error": "No tienes permiso para mostrar este comentario."})
                return
            replies = validate_comment_replies(private_comment.get("replies", []))
            self.send_json(
                HTTPStatus.OK,
                {"comment": private_comment["comment"], "replies": replies},
            )
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
            self.log_error("Could not unlock comment: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo mostrar el comentario privado."},
            )

    def add_comment_reply(self, payload):
        username = payload.get("username")
        password = payload.get("password")
        comment_id = payload.get("commentId")
        reply_id = payload.get("replyId")
        text = payload.get("reply")
        if (
            not isinstance(username, str)
            or not isinstance(password, str)
            or not isinstance(comment_id, str)
            or not comment_id
            or not isinstance(reply_id, str)
            or not reply_id
            or len(reply_id) > 100
            or not all(character.isalnum() or character in "-_" for character in reply_id)
            or not isinstance(text, str)
        ):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": MISSING_PASSWORD_MESSAGE})
            return
        username = username.strip()
        text = text.strip()
        if len(username) + len(password) + 1 > MAX_CREDENTIALS_LENGTH:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "El usuario y la contraseña superan el límite permitido."},
            )
            return
        if len(text.encode("utf-16-le")) // 2 > 50:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "La respuesta admite hasta 50 caracteres."},
            )
            return
        if not text:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Escribe una respuesta."})
            return
        try:
            verified_username, authentication_error = self.verify_credentials(
                f"{username}:{password}"
            )
        except (OSError, ValueError) as error:
            self.log_error("Could not verify reply credentials: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo verificar el usuario. Inténtalo más tarde."},
            )
            return
        if authentication_error:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": authentication_error})
            return

        try:
            with comments_lock:
                if not COMMENTS_FILE.exists():
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "No se encontró el comentario."})
                    return
                with COMMENTS_FILE.open("r", encoding="utf-8") as file:
                    records = [
                        json.loads(line)
                        for line in file
                        if line.strip() and not line.lstrip().startswith("#")
                    ]
                record = next(
                    (item for item in records if item.get("requestId") == comment_id),
                    None,
                )
                if record is None:
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "No se encontró el comentario."})
                    return
                if record.get("deleted"):
                    self.send_json(HTTPStatus.GONE, {"error": "Este comentario ya fue eliminado."})
                    return
                if record.get("private") and verified_username not in {
                    record.get("name"),
                    record.get("recipient"),
                }:
                    self.send_json(
                        HTTPStatus.FORBIDDEN,
                        {"error": "Solo el remitente o destinatario puede responder a este comentario privado."},
                    )
                    return
                replies = validate_comment_replies(record.get("replies", []))
                existing_reply = next((item for item in replies if item.get("id") == reply_id), None)
                if existing_reply:
                    if existing_reply.get("username") != verified_username:
                        self.send_json(
                            HTTPStatus.CONFLICT,
                            {"error": "El identificador de respuesta ya está en uso."},
                        )
                        return
                    self.send_json(HTTPStatus.CREATED, {"reply": existing_reply})
                    return
                if any(reply.get("username") == verified_username for reply in replies):
                    self.send_json(
                        HTTPStatus.CONFLICT,
                        {"error": "Ya has respondido a este comentario."},
                    )
                    return
                if len(replies) >= 5:
                    self.send_json(
                        HTTPStatus.CONFLICT,
                        {"error": "Este comentario ya tiene el máximo de 5 respuestas."},
                    )
                    return
                reply = {
                    "id": reply_id,
                    "username": verified_username,
                    "text": text,
                    "icon": secrets.randbelow(5) + 1,
                    "angle": secrets.randbelow(61) - 30,
                    "date": datetime.now().astimezone().isoformat(timespec="seconds"),
                }
                replies.append(reply)
                record["replies"] = replies
                temporary_path = None
                try:
                    with tempfile.NamedTemporaryFile(
                        mode="w",
                        encoding="utf-8",
                        dir=COMMENTS_FILE.parent,
                        prefix=COMMENTS_FILE.name + ".",
                        suffix=".tmp",
                        delete=False,
                    ) as file:
                        temporary_path = Path(file.name)
                        for item in records:
                            file.write(json.dumps(item, ensure_ascii=False) + "\n")
                    os.replace(temporary_path, COMMENTS_FILE)
                finally:
                    if temporary_path and temporary_path.exists():
                        temporary_path.unlink()
            self.send_json(HTTPStatus.CREATED, {"reply": reply})
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            self.log_error("Could not save comment reply: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo guardar la respuesta. Inténtalo de nuevo."},
            )

    def manage_comment(self, payload, action):
        username = payload.get("username")
        password = payload.get("password")
        comment_id = payload.get("commentId")
        operation = payload.get("operation", "")
        if (
            not isinstance(username, str)
            or not isinstance(password, str)
            or payload.get("credentialsProvided") is not True
            or not isinstance(comment_id, str)
            or not comment_id
            or (action == "edit" and operation not in {"load", "save"})
        ):
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": MISSING_PASSWORD_MESSAGE},
            )
            return

        username = username.strip()
        if len(username) + len(password) + 1 > MAX_CREDENTIALS_LENGTH:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "El usuario y la contraseña superan el límite permitido."},
            )
            return
        try:
            entries = self.load_users()
            if not username or not password:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": MISSING_PASSWORD_MESSAGE})
                return
            if username not in entries:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": UNKNOWN_USER_MESSAGE})
                return
            salt, expected_hash = entries[username]
            actual_hash = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
            ).hex()
            if not hmac.compare_digest(actual_hash, expected_hash):
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": INCORRECT_PASSWORD_MESSAGE})
                return
        except (OSError, ValueError) as error:
            self.log_error("Could not verify comment management credentials: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo verificar el usuario. Inténtalo más tarde."},
            )
            return

        try:
            with comments_lock:
                if not COMMENTS_FILE.exists():
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "No se encontró el comentario."})
                    return
                with COMMENTS_FILE.open("r", encoding="utf-8") as file:
                    records = [
                        json.loads(line)
                        for line in file
                        if line.strip() and not line.lstrip().startswith("#")
                    ]

                record = next(
                    (item for item in records if item.get("requestId") == comment_id),
                    None,
                )
                if record is None:
                    self.send_json(HTTPStatus.NOT_FOUND, {"error": "No se encontró el comentario."})
                    return
                if record.get("name") != username:
                    self.send_json(
                        HTTPStatus.FORBIDDEN,
                        {"error": "El usuario y la contraseña no corresponden a este comentario."},
                    )
                    return
                if record.get("deleted"):
                    self.send_json(HTTPStatus.GONE, {"error": "Este comentario ya fue eliminado."})
                    return

                if action == "edit" and operation == "load":
                    self.send_json(HTTPStatus.OK, {"comment": record["comment"]})
                    return
                if action == "edit":
                    text = payload.get("comment")
                    if not isinstance(text, str) or not text.strip():
                        self.send_json(
                            HTTPStatus.BAD_REQUEST,
                            {"error": "Escribe un comentario antes de guardar los cambios."},
                        )
                        return
                    text = text.strip()
                    if len(text.encode("utf-16-le")) // 2 > MAX_COMMENT_LENGTH:
                        self.send_json(
                            HTTPStatus.BAD_REQUEST,
                            {"error": "El comentario admite hasta 280 caracteres."},
                        )
                        return
                    if count_line_breaks(text) > MAX_COMMENT_LINE_BREAKS:
                        self.send_json(
                            HTTPStatus.BAD_REQUEST,
                            {"error": "El comentario admite como máximo 3 saltos de línea."},
                        )
                        return
                    record["comment"] = text
                    record["edited"] = datetime.now().astimezone().isoformat(timespec="seconds")
                else:
                    record["deleted"] = True

                temporary_path = None
                try:
                    with tempfile.NamedTemporaryFile(
                        mode="w",
                        encoding="utf-8",
                        dir=COMMENTS_FILE.parent,
                        prefix=COMMENTS_FILE.name + ".",
                        suffix=".tmp",
                        delete=False,
                    ) as file:
                        temporary_path = Path(file.name)
                        for item in records:
                            file.write(json.dumps(item, ensure_ascii=False) + "\n")
                    os.replace(temporary_path, COMMENTS_FILE)
                finally:
                    if temporary_path and temporary_path.exists():
                        temporary_path.unlink()

                public_comment = {
                    "date": record["date"],
                    "name": record["name"],
                    "requestId": record["requestId"],
                    "private": bool(record.get("private")),
                    "recipient": record.get("recipient", "") if record.get("private") else "",
                    "edited": bool(record.get("edited")),
                    "editedAt": record.get("edited", ""),
                    "deleted": bool(record.get("deleted")),
                }
                if not record.get("deleted"):
                    public_comment["comment"] = record["comment"]
                    public_comment["replies"] = record.get("replies", [])
                self.send_json(HTTPStatus.OK, {"comment": public_comment})
        except (OSError, KeyError, ValueError, json.JSONDecodeError) as error:
            self.log_error("Could not manage comment: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "error": (
                        "No se pudo modificar el comentario. Inténtalo más tarde."
                        if action == "edit"
                        else "No se pudo eliminar el comentario. Inténtalo más tarde."
                    )
                },
            )


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), SiteHandler)
    print(f"Servidor disponible en http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()
