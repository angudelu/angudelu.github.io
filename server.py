import hashlib
import hmac
import json
import os
import threading
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
COMMENTS_FILE = ROOT / "comentarios.txt"
USERS_FILE = ROOT / "usuarios.txt"
MAX_REQUEST_BYTES = 4096
MAX_CREDENTIALS_LENGTH = 160
MAX_COMMENT_LENGTH = 280
PASSWORD_HASH_ITERATIONS = 600_000
comments_lock = threading.Lock()
users_lock = threading.Lock()
MAX_COMMENTS_PER_DAY = 5
INVALID_CREDENTIALS_MESSAGE = (
    "Tienes que escribirme a mí para conseguir un usuario y contraseña "
    "y así poder comentar."
)
INVALID_RECIPIENT_MESSAGE = "destinatario no existente"
MISSING_PASSWORD_MESSAGE = (
    'tienes que introducir el usuario y contraseña en la misma caja de esta forma: '
    '"usuario:contraseña"'
)
INCORRECT_PASSWORD_MESSAGE = "usuario existente, contraseña incorrecta"


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
        }:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if request_path == "/api/comments":
            try:
                with comments_lock:
                    comments = []
                    if COMMENTS_FILE.exists():
                        with COMMENTS_FILE.open("r", encoding="utf-8") as file:
                            for line_number, line in enumerate(file, start=1):
                                if not line.strip() or line.lstrip().startswith("#"):
                                    continue
                                try:
                                    saved_comment = json.loads(line)
                                    if saved_comment.get("private"):
                                        comments.append({
                                            "date": saved_comment["date"],
                                            "name": saved_comment["name"],
                                            "recipient": saved_comment.get("recipient", ""),
                                            "requestId": saved_comment["requestId"],
                                            "private": True,
                                        })
                                    else:
                                        comments.append(saved_comment)
                                except json.JSONDecodeError as error:
                                    raise ValueError(
                                        f"Invalid comment data on line {line_number}"
                                    ) from error
                self.send_json(HTTPStatus.OK, {"comments": list(reversed(comments))})
            except (OSError, ValueError) as error:
                self.log_error("Could not read comments: %s", error)
                self.send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"error": "No se pudieron leer los comentarios guardados."},
                )
            return
        super().do_GET()

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

        try:
            entries = self.load_users()
        except OSError as error:
            self.log_error("Could not read users file: %s", error)
            raise

        entry = entries.get(username)
        if entry is None:
            return None, INVALID_CREDENTIALS_MESSAGE
        if not separator or not password:
            return None, MISSING_PASSWORD_MESSAGE

        salt, expected_hash = entry
        actual_hash = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
        ).hex()
        if not hmac.compare_digest(actual_hash, expected_hash):
            return None, INCORRECT_PASSWORD_MESSAGE
        return username, None

    def do_POST(self):
        request_path = urlsplit(self.path).path
        if request_path not in {"/api/comments", "/api/comments/unlock"}:
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

        if request_path == "/api/comments/unlock":
            self.unlock_comment(payload)
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
                if COMMENTS_FILE.exists():
                    with COMMENTS_FILE.open("r", encoding="utf-8") as file:
                        for line in file:
                            if not line.strip() or line.lstrip().startswith("#"):
                                continue
                            saved_comment = json.loads(line)
                            saved_date = datetime.fromisoformat(saved_comment["date"]).date()
                            if saved_comment["name"] == username and saved_date == today:
                                comments_today += 1
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
                        if record.get("requestId") == request_id and record.get("private"):
                            private_comment = record
                            break
            if private_comment is None:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "No se encontró el comentario privado."})
                return
            if username not in {private_comment["name"], private_comment["recipient"]}:
                self.send_json(HTTPStatus.FORBIDDEN, {"error": "No tienes permiso para mostrar este comentario."})
                return
            self.send_json(HTTPStatus.OK, {"comment": private_comment["comment"]})
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
            self.log_error("Could not unlock comment: %s", error)
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "No se pudo mostrar el comentario privado."},
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
