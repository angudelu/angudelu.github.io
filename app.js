function getLocalDateTime() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const appRootUrl = new URL(".", document.currentScript.src);
let postVoteCountsPromise;
let postVoteCountsError = "";

function parsePosts(contents, file) {
	const posts = [];
	const color = file.match(/(?:^|\/)(magenta|amarillo|cian|negro)\//)?.[1]
		|| window.location.pathname.match(/\/(magenta|amarillo|cian|negro)\//)?.[1]
		|| "unknown";
	const occurrences = new Map();
	const entryPattern = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?\|/gm;
	const entries = [...contents.matchAll(entryPattern)];
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		const [, normalizedDate, hour = "00", minute = "00"] = entry;
		const contentStart = entry.index + entry[0].length;
		const contentEnd = entries[index + 1]?.index ?? contents.length;
		let content = contents.slice(contentStart, contentEnd).trim();
		const authorField = /^@([^|\r\n]{1,60})\|/.exec(content);
		const author = authorField ? authorField[1].trim() : "";
		if (authorField) {
			content = content.slice(authorField[0].length);
		}
		const [year, month, day] = normalizedDate.split("-").map(Number);
		const hours = Number(hour);
		const minutes = Number(minute);
		const dateTime = `${normalizedDate}T${hour}:${minute}`;
		const occurrence = occurrences.get(dateTime) || 0;
		occurrences.set(dateTime, occurrence + 1);
		const parsedDate = new Date(Date.UTC(year, month - 1, day));
		if (
			parsedDate.getUTCFullYear() !== year ||
			parsedDate.getUTCMonth() !== month - 1 ||
			parsedDate.getUTCDate() !== day ||
			hours > 23 ||
			minutes > 59
		) {
			continue;
		}

		let image = "";
		let link = "";
		const imageFields = /\|([^|\r\n]*)\|([^|\r\n]*)\s*$/.exec(content);
		if (imageFields) {
			content = content.slice(0, imageFields.index).trimEnd();
			image = imageFields[1].trim();
			link = imageFields[2].trim();
		}
		const text = content.replace(/\\n/g, "\n").trim();
		if (text.trim() || image.trim()) {
			posts.push({
				date: normalizedDate,
				time: `${hour}:${minute}`,
				dateTime,
				author,
				postId: `${color}:${dateTime}:${occurrence}`,
				text,
				image,
				link
			});
		}
	}
	return posts.sort((first, second) => second.dateTime.localeCompare(first.dateTime));
}

function getPostForDate(posts, dateTime) {
	return posts.find((post) => post.dateTime <= dateTime) ?? null;
}

function getSafeUrl(value) {
	if (!value) {
		return null;
	}

	try {
		const url = new URL(value, appRootUrl);
		return ["http:", "https:"].includes(url.protocol) ? url.href : null;
	} catch (error) {
		console.error(`URL no válida en una publicación: ${value}`, error);
		return null;
	}
}

function appendFormattedPostText(element, text) {
	const fragment = document.createDocumentFragment();
	const boldPattern = /_([^_]+)_/gs;
	let lastIndex = 0;
	for (const match of text.matchAll(boldPattern)) {
		fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
		const bold = document.createElement("strong");
		bold.textContent = match[1];
		fragment.append(bold);
		lastIndex = match.index + match[0].length;
	}
	fragment.append(document.createTextNode(text.slice(lastIndex)));
	element.append(fragment);
}

function formatPublicationDate(value, now = new Date()) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return String(value);
	}
	const age = now.getTime() - date.getTime();
	if (age >= 0 && age < 60 * 60 * 1000) {
		return "hace unos minutos";
	}
	if (age >= 60 * 60 * 1000 && age < 24 * 60 * 60 * 1000) {
		return new Intl.DateTimeFormat("es-ES", {
			hour: "2-digit",
			minute: "2-digit"
		}).format(date);
	}
	return new Intl.DateTimeFormat("es-ES", {
		dateStyle: "medium",
		timeStyle: "short"
	}).format(date);
}

function countLineBreaks(text) {
	return (text.match(/\r\n|\r|\n/g) || []).length;
}

function getCommentWeight(comment) {
	if (comment.private) {
		return 0;
	}
	return comment.edited ? 1.5 : 1;
}

function getReceivedReplyCount(comment) {
	if (comment.private) {
		return 0;
	}
	return (comment.replies || []).filter((reply) => reply.username !== comment.name).length;
}

function formatPointChange(change) {
	if (change === 0) {
		return "sin cambio en puntos";
	}
	const value = new Intl.NumberFormat("es-ES", {
		maximumFractionDigits: 2
	}).format(Math.abs(change));
	const unit = Math.abs(change) === 1 ? "punto" : "puntos";
	return `${change > 0 ? "+" : "−"}${value} ${unit}`;
}

function updateDisplayedCommentPoints(username, points) {
	if (!username || !Number.isFinite(points)) {
		return;
	}
	const formattedPoints = new Intl.NumberFormat("es-ES", {
		maximumFractionDigits: 2
	}).format(points);
	const unit = Math.abs(points) === 1 ? "punto" : "puntos";
	document.querySelectorAll(".comment").forEach((comment) => {
		if (comment.dataset.commentAuthor !== username) {
			return;
		}
		const name = comment.querySelector(".comment-name");
		if (!name) {
			return;
		}
		let pointsLabel = name.querySelector(".comment-points");
		if (!pointsLabel) {
			pointsLabel = document.createElement("small");
			pointsLabel.className = "comment-points";
			name.append(pointsLabel);
		}
		pointsLabel.textContent = `${formattedPoints} ${unit}`;
		pointsLabel.setAttribute("aria-label", `Puntos de ${username}: ${pointsLabel.textContent}`);
	});
}

function getEditPointChange(comment) {
	return !comment.private && !comment.edited ? -0.5 : 0;
}

function getDeletePointChange(comment) {
	return getCommentWeight(comment) - getReceivedReplyCount(comment);
}

function getPublicCommentPointChange(isPrivate) {
	return isPrivate ? 0 : -1;
}

function updateCommentSubmissionState() {
	const form = document.querySelector("#comment-form");
	const submit = form?.querySelector("button[type='submit']");
	const recipient = document.querySelector("#comment-recipient");
	if (!submit || !recipient) {
		return;
	}
	const isPrivate = Boolean(recipient.value.trim());
	const pointChange = getPublicCommentPointChange(isPrivate);
	submit.textContent = `publicar comentario (${formatPointChange(pointChange)})`;
	submit.title = activeCommentPoints !== null && activeCommentPoints < 1
		? "No tienes puntos suficientes. Borra uno de tus comentarios para recuperar puntos."
		: "";
	const insufficientPoints = activeCommentPoints !== null && activeCommentPoints < 1;
	submit.disabled = commentSubmissionInProgress || insufficientPoints;
	const status = document.querySelector("#comment-status");
	if (status && !commentSubmissionInProgress) {
		if (insufficientPoints) {
			status.textContent = "No tienes puntos suficientes para comentar. Borra uno de tus comentarios para recuperar puntos.";
			status.classList.add("comment-status--error");
		} else if (status.textContent.startsWith("No tienes puntos suficientes")) {
			status.textContent = "";
			status.classList.remove("comment-status--error");
		}
	}
}

function createPostElement(post) {
	const container = document.createElement("article");
	container.className = "history-post";
	container.dataset.postId = post.postId;

	const metadata = document.createElement("div");
	metadata.className = "post-meta";
	const author = document.createElement("span");
	author.className = "post-author";
	if (post.author) {
		const profile = document.createElement("img");
		profile.className = "post-author-icon";
		profile.src = new URL(`icons/${encodeURIComponent(post.author)}.svg`, appRootUrl).href;
		profile.alt = "";
		profile.addEventListener("error", () => profile.remove(), { once: true });
		author.append(profile, document.createTextNode(post.author));
	} else {
		author.textContent = "anónimo";
	}
	const dateElement = document.createElement("time");
	dateElement.className = "post-date";
	dateElement.dateTime = post.dateTime;
	dateElement.textContent = formatPublicationDate(post.dateTime);
	metadata.append(author, dateElement);
	container.append(metadata);

	if (post.text) {
		const textElement = document.createElement("p");
		textElement.className = "post-text";
		appendFormattedPostText(textElement, post.text);
		container.append(textElement);
	}

	const imageUrl = getSafeUrl(post.image);
	if (imageUrl) {
		const imageElement = document.createElement("img");
		imageElement.className = "post-image";
		imageElement.src = imageUrl;
		imageElement.alt = post.text || `Imagen de la publicación del ${post.date}`;
		imageElement.addEventListener("error", () => {
			imageElement.alt = "imagen perdida";
		}, { once: true });

		const linkUrl = getSafeUrl(post.link);
		if (linkUrl) {
			const linkElement = document.createElement("a");
			linkElement.href = linkUrl;
			linkElement.target = "_blank";
			linkElement.rel = "noopener noreferrer";
			linkElement.setAttribute("aria-label", `Abrir enlace de la publicación del ${post.date}`);
			linkElement.append(imageElement);
			container.append(linkElement);
		} else {
			container.append(imageElement);
		}
	}

	const votes = postVoteCountsPromise;
	const actions = document.createElement("div");
	actions.className = "post-votes";
	actions.setAttribute("aria-label", "Votar esta publicación");
	for (const [value, label, key] of [[1, "Me gusta", "likes"], [-1, "No me gusta", "dislikes"]]) {
		const button = document.createElement("button");
		button.className = `post-vote post-vote--${key}`;
		button.type = "button";
		button.setAttribute("aria-label", label);
		button.textContent = `${label} (0)`;
		button.addEventListener("click", async () => {
			button.disabled = true;
			try {
				const result = await submitPostVote(post.postId, value);
				for (const voteButton of actions.querySelectorAll(".post-vote")) {
					const voteKey = voteButton.classList.contains("post-vote--likes") ? "likes" : "dislikes";
					voteButton.textContent = `${voteKey === "likes" ? "Me gusta" : "No me gusta"} (${result.votes[voteKey]})`;
				}
				if (Number.isFinite(result.accountPoints)) {
					activeCommentPoints = result.accountPoints;
					updateCommentSubmissionState();
				}
				updateDisplayedCommentPoints(post.author, result.postAuthorPoints);
				status.textContent = result.message || "Voto guardado.";
			} catch (error) {
				status.textContent = error.message || "No se pudo guardar el voto.";
				if (error.status === 401) {
					window.location.assign(new URL("#comment-name", appRootUrl).href);
				}
			} finally {
				button.disabled = false;
			}
		});
		actions.append(button);
	}
	const status = document.createElement("small");
	status.className = "post-vote-status";
	status.setAttribute("role", "status");
	actions.append(status);
	container.append(actions);

	if (votes) {
		votes.then((counts) => {
			const postVotes = counts[post.postId] || { likes: 0, dislikes: 0 };
			actions.querySelector(".post-vote--likes").textContent = `Me gusta (${postVotes.likes})`;
			actions.querySelector(".post-vote--dislikes").textContent = `No me gusta (${postVotes.dislikes})`;
			if (postVoteCountsError) {
				status.textContent = "No se pudieron cargar los votos.";
			}
		}).catch((error) => {
			status.textContent = "No se pudieron cargar los votos.";
			console.error(error);
		});
	}
	return container;
}

async function fetchPosts(file) {
	const response = await fetch(file);
	if (!response.ok) {
		throw new Error(`no se va poder cargar ${file} (${response.status})`);
	}
	return parsePosts(await response.text(), file);
}

async function loadGridText(element, date) {
	const file = element.dataset.textFile;
	try {
		const posts = await fetchPosts(file);
		await postVoteCountsPromise;
		const post = getPostForDate(posts, date);
		if (!post) {
			element.textContent = `no hay publicaciones anteriores o programadas para el ${date}`;
			return;
		}
		element.replaceChildren(createPostElement(post));
	} catch (error) {
		element.textContent = `no se va poder cargar ${file}. comprueba que el arxivo exista y que la página se sirva desde un servidor web`;
		console.error(error);
	}
}

const now = getLocalDateTime();
document.querySelectorAll(".grid-text").forEach((element) => {
	loadGridText(element, now);
});

async function loadPostVoteCounts() {
	if (!window.COMMENTS_API_URL) {
		const response = await fetch("/api/posts/votes");
		const result = await response.json();
		if (!response.ok) {
			throw new Error(result.error || "No se pudieron cargar los votos.");
		}
		return result.votes || {};
	}

	return new Promise((resolve, reject) => {
		const callbackName = `postVotesCallback${Date.now()}${Math.random().toString(36).slice(2)}`;
		const script = document.createElement("script");
		const timeout = window.setTimeout(() => {
			cleanup();
			reject(new Error("Tiempo de espera agotado al consultar los votos."));
		}, 15000);
		const cleanup = () => {
			window.clearTimeout(timeout);
			delete window[callbackName];
			script.remove();
		};
		window[callbackName] = (result) => {
			cleanup();
			if (result.error) {
				reject(new Error(result.error));
				return;
			}
			if ((result.apiVersion || 0) < 8) {
				reject(new Error("Los votos requieren la versión actualizada de Apps Script (apiVersion 8)."));
				return;
			}
			resolve(result.votes || {});
		};
		script.onerror = () => {
			cleanup();
			reject(new Error("No se pudieron cargar los votos."));
		};
		script.src = `${window.COMMENTS_API_URL}${window.COMMENTS_API_URL.includes("?") ? "&" : "?"}action=postVotes&callback=${callbackName}`;
		document.head.append(script);
	});
}

async function submitPostVote(postId, value) {
	if (!activeCommentCredentials) {
		const error = new Error("Tienes que iniciar sesión para votar.");
		error.status = 401;
		throw error;
	}
	const fields = {
		action: "postVote",
		requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		postId,
		vote: value,
		username: activeCommentCredentials.username,
		password: activeCommentCredentials.password
	};
	if (window.COMMENTS_API_URL) {
		const api = await loadAppsScriptComments();
		if ((api.apiVersion || 0) < 8) {
			throw new Error("Los votos requieren la versión actualizada de Apps Script. Publica la versión nueva de Code.gs.");
		}
		return submitAppsScriptRequest(fields);
	}
	const response = await fetch("/api/posts/vote", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(fields)
	});
	const result = await response.json();
	if (!response.ok) {
		throw Object.assign(new Error(result.error || "No se pudo guardar el voto."), {
			status: response.status
		});
	}
	return result;
}

postVoteCountsPromise = loadPostVoteCounts().catch((error) => {
	postVoteCountsError = error.message;
	console.error("No se pudieron cargar los votos de las publicaciones.", error);
	return {};
});

const socialMenu = document.querySelector("#social-menu");
const socialMenuToggle = document.querySelector("#social-menu-toggle");
if (socialMenu && socialMenuToggle) {
	socialMenuToggle.addEventListener("click", () => {
		const isOpen = socialMenu.classList.toggle("is-open");
		socialMenuToggle.setAttribute("aria-expanded", String(isOpen));
	});

	document.addEventListener("click", (event) => {
		if (!socialMenu.contains(event.target)) {
			socialMenu.classList.remove("is-open");
			socialMenuToggle.setAttribute("aria-expanded", "false");
		}
	});

	socialMenu.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			socialMenu.classList.remove("is-open");
			socialMenuToggle.setAttribute("aria-expanded", "false");
			socialMenuToggle.focus();
		}
	});
}

document.querySelectorAll("[data-history-file]").forEach(async (element) => {
	const file = element.dataset.historyFile;
	try {
		const posts = (await fetchPosts(file)).filter((post) => post.dateTime <= now);
		await postVoteCountsPromise;
		if (posts.length === 0) {
			element.textContent = "encara no hay publicaciones en este historial";
			return;
		}
		element.replaceChildren(...posts.map(createPostElement));
	} catch (error) {
		element.textContent = `no se va poder cargar ${file}. comprueba que el arxivo exista y que la página se sirva desde un servidor web`;
		console.error(error);
	}
});

let activeCommentCredentials = null;
let activeCommentPoints = null;
let commentSubmissionInProgress = false;
const commentSessionStorageKey = "angudelu-comment-session";

function clearStoredCommentSession() {
	try {
		localStorage.removeItem(commentSessionStorageKey);
	} catch (error) {
		console.error("No se pudo borrar la sesión guardada.", error);
	}
}

function rememberCommentCredentials(credentials) {
	const parsed = parseManagementCredentials(credentials);
	activeCommentCredentials = parsed;
	activeCommentPoints = null;
	let persistenceSucceeded = true;
	try {
		localStorage.setItem(commentSessionStorageKey, JSON.stringify(parsed));
	} catch (error) {
		console.error("No se pudo guardar la sesión en este navegador.", error);
		persistenceSucceeded = false;
	}

	replaceCredentialsWithUsername(document.querySelector("#comment-name"), true);
	const loginHelp = document.querySelector(".login-help");
	if (loginHelp) {
		loginHelp.hidden = true;
	}
	document.querySelectorAll(".comment-replies").forEach((container) => {
		const replyOption = container.closest(".comment")?.querySelector("[data-comment-reply-option]");
		if (replyOption) {
			replyOption.disabled = hasReachedReplyLimit(container.replyData || []);
		}
	});
	updateCommentSubmissionState();
	return persistenceSucceeded;
}

function replaceCredentialsWithUsername(input, mainField = false) {
	if (!input?.isConnected) {
		return;
	}
	const username = document.createElement("strong");
	username.className = "comment-signed-in-user";
	username.textContent = activeCommentCredentials.username;
	const field = input.parentElement;
	input.replaceWith(username);
	if (mainField) {
		const label = document.querySelector("#comment-form label[for='comment-name']");
		if (label) {
			label.textContent = "usuario con sesión iniciada";
		}
		document.querySelector("#toggle-password")?.setAttribute("hidden", "");
		document.querySelector("#login-button")?.setAttribute("hidden", "");
	} else {
		field?.querySelector(".comment-credentials-toggle")?.remove();
	}
}

function getCommentCredentials() {
	if (!activeCommentCredentials) {
		throw new Error("Tienes que iniciar sesión primero.");
	}
	return `${activeCommentCredentials.username}:${activeCommentCredentials.password}`;
}

function requireCommentLogin(status) {
	if (activeCommentCredentials) {
		return true;
	}
	status.textContent = "Tienes que iniciar sesión primero.";
	status.classList.add("comment-status--error");
	document.querySelector("#comment-name")?.focus();
	return false;
}

function hasReachedReplyLimit(replies) {
	return replies.length >= 5 || Boolean(
		activeCommentCredentials &&
		replies.some((reply) => reply.username === activeCommentCredentials.username)
	);
}

function getUsernameIconPath(username) {
	if (
		typeof username !== "string" ||
		!username ||
		username.length > 80 ||
		/[\/\\\u0000-\u001f]/.test(username)
	) {
		return "";
	}
	return `icons/${encodeURIComponent(username)}.svg`;
}

function renderCommentReplies(container, replies) {
	container.replaceChildren();
	container.replyData = replies;
	const replyOption = container.closest(".comment")?.querySelector("[data-comment-reply-option]");
	if (replyOption) {
		replyOption.disabled = hasReachedReplyLimit(replies);
	}
	const directReply = container.closest(".comment")?.querySelector(".comment-direct-reply");
	if (directReply) {
		directReply.disabled = hasReachedReplyLimit(replies);
	}
	replies.forEach((reply) => {
		const pin = document.createElement("button");
		pin.className = "comment-reply-pin";
		pin.type = "button";
		pin.title = "Mostrar respuesta";
		pin.setAttribute("aria-label", `Mostrar respuesta de ${reply.username}`);
		pin.setAttribute("aria-expanded", "false");
		const icon = document.createElement("img");
		const usernameIconPath = getUsernameIconPath(reply.username);
		const iconNumber = Number.isInteger(reply.icon) && reply.icon >= 1 && reply.icon <= 5
			? reply.icon
			: 1;
		icon.src = usernameIconPath || `icons/iconoresp${iconNumber}.svg`;
		icon.alt = "";
		icon.width = 42;
		icon.height = 42;
		icon.addEventListener("error", () => {
			if (usernameIconPath && icon.src.endsWith(usernameIconPath)) {
				icon.src = `icons/iconoresp${iconNumber}.svg`;
			}
		}, { once: true });
		const text = document.createElement("span");
		text.className = "comment-reply-text";
		text.hidden = true;
		const author = document.createElement("span");
		author.className = "comment-reply-author";
		if (usernameIconPath) {
			const avatar = document.createElement("img");
			avatar.className = "comment-reply-avatar";
			avatar.src = usernameIconPath;
			avatar.alt = "";
			avatar.addEventListener("error", () => avatar.remove(), { once: true });
			author.append(avatar);
		}
		const username = document.createElement("strong");
		username.textContent = reply.username;
		const message = document.createElement("span");
		message.className = "comment-reply-message";
		message.textContent = reply.text;
		author.append(username);
		text.append(author, message);
		pin.style.setProperty("--reply-angle", `${Number(reply.angle) || 0}deg`);
		pin.append(icon, text);

		const setOpen = (open) => {
			icon.hidden = open;
			text.hidden = !open;
			pin.classList.toggle("is-open", open);
			pin.setAttribute("aria-expanded", String(open));
		};
		pin.addEventListener("mouseenter", () => {
			closeExpandedReplies(pin);
			setOpen(true);
		});
		pin.addEventListener("mouseleave", () => {
			if (pin.dataset.pinned !== "true") {
				setOpen(false);
			}
		});
		pin.addEventListener("focus", () => {
			closeExpandedReplies(pin);
			setOpen(true);
		});
		pin.addEventListener("blur", () => {
			if (pin.dataset.pinned !== "true") {
				setOpen(false);
			}
		});
		pin.addEventListener("click", () => {
			const pinned = pin.dataset.pinned !== "true";
			pin.dataset.pinned = String(pinned);
			setOpen(pinned);
		});
		pin.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				pin.dataset.pinned = "false";
				setOpen(false);
			}
		});
		container.append(pin);
	});
}

function createCommentElement(comment) {
	if (comment.deleted) {
		const deleted = document.createElement("p");
		deleted.className = "comment-deleted";
		deleted.textContent = `comentario borrado por '${comment.name || "usuario desconocido"}'`;
		return deleted;
	}

	const article = document.createElement("article");
	article.className = "comment";
	article.dataset.commentId = comment.requestId || "";
	article.dataset.commentAuthor = comment.name || "";
	article.dataset.commentRecipient = comment.recipient || "";
	const replies = document.createElement("div");
	replies.className = "comment-replies";
	replies.setAttribute("aria-label", "Respuestas");
	renderCommentReplies(replies, comment.replies || []);
	article.append(replies);

	const header = document.createElement("div");
	header.className = "comment-header";

	const name = document.createElement("strong");
	name.className = "comment-name";
	const authorPoints = Number(comment.authorPoints);
	if (Number.isFinite(authorPoints)) {
		const points = document.createElement("small");
		points.className = "comment-points";
		const formattedPoints = new Intl.NumberFormat("es-ES", {
			maximumFractionDigits: 2
		}).format(authorPoints);
		const pointsUnit = Math.abs(authorPoints) === 1 ? "punto" : "puntos";
		points.textContent = `${formattedPoints} ${pointsUnit}`;
		points.setAttribute("aria-label", `Puntos de ${comment.name}: ${points.textContent}`);
		name.append(points);
	}
	const authorIconPath = getUsernameIconPath(comment.name);
	if (authorIconPath) {
		const avatar = document.createElement("img");
		avatar.className = "comment-author-avatar";
		avatar.src = authorIconPath;
		avatar.alt = "";
		avatar.addEventListener("error", () => avatar.remove(), { once: true });
		name.append(avatar);
	}
	const authorName = document.createElement("span");
	authorName.textContent = comment.private && comment.recipient
		? `${comment.name}@${comment.recipient}`
		: comment.name;
	name.append(authorName);
	header.append(name);

	const date = document.createElement("time");
	date.className = "comment-date";
	date.dateTime = comment.date;
	date.textContent = formatPublicationDate(comment.date);
	header.append(date);
	if (comment.edited) {
		const edited = document.createElement("small");
		edited.className = "comment-edited";
		const editedAt = comment.editedAt || "";
		if (editedAt) {
			const editedDate = new Date(editedAt);
			if (!Number.isNaN(editedDate.getTime())) {
				edited.textContent = `(editado: ${new Intl.DateTimeFormat("es-ES", {
					dateStyle: "medium",
					timeStyle: "short"
				}).format(editedDate)})`;
				edited.dateTime = editedDate.toISOString();
				edited.title = `Última edición: ${edited.textContent.slice(10, -1)}`;
			} else {
				edited.textContent = "(editado)";
			}
		} else {
			edited.textContent = "(editado)";
		}
		header.append(edited);
	}

	if (comment.private) {
		article.classList.add("comment--private");
	}
	article.append(header);
	const text = document.createElement("p");
	text.className = "comment-text";
	text.textContent = comment.comment;
	article.append(text);

	const controls = document.createElement("div");
	controls.className = "comment-controls";
	const menuToggle = document.createElement("button");
	menuToggle.className = "comment-menu-toggle";
	menuToggle.type = "button";
	menuToggle.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 8"><circle cx="3" cy="4" r="2.5"></circle><circle cx="12" cy="4" r="2.5"></circle><circle cx="21" cy="4" r="2.5"></circle></svg>';
	menuToggle.setAttribute("aria-label", "opciones del comentario");
	menuToggle.setAttribute("aria-expanded", "false");
	const menu = document.createElement("div");
	menu.className = "comment-menu";
	menu.hidden = true;
	const editOption = document.createElement("button");
	editOption.type = "button";
	editOption.textContent = `editar (${formatPointChange(getEditPointChange(comment))})`;
	const deleteOption = document.createElement("button");
	deleteOption.type = "button";
	deleteOption.textContent = `eliminar (${formatPointChange(getDeletePointChange(comment))})`;
	const replyOption = document.createElement("button");
	replyOption.type = "button";
	replyOption.textContent = "responder";
	replyOption.dataset.commentReplyOption = "true";
	replyOption.disabled = hasReachedReplyLimit(comment.replies || []);
	menu.append(editOption, deleteOption, replyOption);
	const directReply = document.createElement("button");
	directReply.className = "comment-direct-reply";
	directReply.type = "button";
	directReply.textContent = "responder";
	directReply.disabled = hasReachedReplyLimit(comment.replies || []);
	const ownsComment = Boolean(
		activeCommentCredentials &&
		activeCommentCredentials.username === comment.name
	);
	if (activeCommentCredentials && !ownsComment) {
		controls.append(directReply);
	} else {
		controls.append(menuToggle, menu);
	}

	const management = document.createElement("div");
	management.className = "comment-management";
	management.hidden = true;
	article.append(controls, management);

	menuToggle.addEventListener("click", () => {
		if (!activeCommentCredentials) {
			showLoginRequired();
			return;
		}
		if (activeCommentCredentials.username !== comment.name) {
			return;
		}
		menu.hidden = !menu.hidden;
		menuToggle.setAttribute("aria-expanded", String(!menu.hidden));
	});

	function showManagementForm(form, mode) {
		management.replaceChildren(form);
		management.hidden = false;
		article.classList.toggle("comment--confirm-delete", mode === "delete");
		menu.hidden = true;
		menuToggle.setAttribute("aria-expanded", "false");
	}

	function showLoginRequired() {
		const status = createManagementStatus();
		status.textContent = "Tienes que iniciar sesión primero.";
		status.classList.add("comment-status--error");
		showManagementForm(status, "");
		const loginStatus = document.querySelector("#login-status");
		if (loginStatus) {
			loginStatus.textContent = status.textContent;
			loginStatus.classList.add("comment-status--error");
		}
		const loginInput = document.querySelector("#comment-name");
		if (loginInput) {
			loginInput.focus();
		} else {
			window.location.href = "index.html#comment-name";
		}
	}

	function createManagementStatus() {
		const status = document.createElement("small");
		status.className = "comment-management-status";
		status.setAttribute("role", "status");
		return status;
	}

	editOption.addEventListener("click", () => {
		if (!activeCommentCredentials || activeCommentCredentials.username !== comment.name) {
			showLoginRequired();
			return;
		}
		const form = document.createElement("form");
		form.className = "comment-manage-form";
		const editedText = document.createElement("textarea");
		editedText.name = "comment";
		editedText.maxLength = 280;
		editedText.rows = 4;
		editedText.placeholder = "comentario";
		editedText.value = comment.comment;
		editedText.required = true;
		const status = createManagementStatus();
		const buttons = document.createElement("div");
		buttons.className = "comment-management-buttons";
		const save = document.createElement("button");
		save.type = "submit";
		save.textContent = `guardar cambios (${formatPointChange(getEditPointChange(comment))})`;
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = "comment-cancel-button";
		cancel.textContent = "cancelar";
		buttons.append(save, cancel);
		cancel.addEventListener("click", () => {
			management.hidden = true;
			article.classList.remove("comment--confirm-delete");
		});
		form.append(editedText, buttons, status);
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			save.disabled = true;
			status.textContent = "guardando cambios...";
			status.classList.remove("comment-status--error");
			try {
				await submitCommentManagement(
					"edit", comment, getCommentCredentials(), editedText.value, "save"
				);
				commentListRevision += 1;
				await loadComments();
			} catch (error) {
				status.textContent = error.message || "no se pudo modificar el comentario. inténtalo de nuevo";
				status.classList.add("comment-status--error");
				save.disabled = false;
			}
		});
		showManagementForm(form, "edit");
	});

	deleteOption.addEventListener("click", () => {
		if (!activeCommentCredentials || activeCommentCredentials.username !== comment.name) {
			showLoginRequired();
			return;
		}
		const form = document.createElement("form");
		form.className = "comment-manage-form";
		const confirm = document.createElement("button");
		confirm.type = "submit";
		confirm.className = "comment-delete-confirm";
		confirm.textContent = `confirmar eliminación (${formatPointChange(getDeletePointChange(comment))})`;
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = "comment-cancel-button";
		cancel.textContent = "cancelar";
		const status = createManagementStatus();
		cancel.addEventListener("click", () => {
			management.hidden = true;
			article.classList.remove("comment--confirm-delete");
		});
		form.append(confirm, cancel, status);
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			confirm.disabled = true;
			status.textContent = "comprobando credenciales...";
			status.classList.remove("comment-status--error");
			try {
				await submitCommentManagement(
					"delete", comment, getCommentCredentials()
				);
				commentListRevision += 1;
				await loadComments();
			} catch (error) {
				status.textContent = error.message || "no se pudo eliminar el comentario. inténtalo de nuevo";
				status.classList.add("comment-status--error");
				confirm.disabled = false;
			}
		});
		showManagementForm(form, "delete");
	});

	replyOption.addEventListener("click", () => {
		if (!activeCommentCredentials) {
			showLoginRequired();
			return;
		}
		const form = document.createElement("form");
		form.className = "comment-reply-form";
		const status = createManagementStatus();
		const identity = document.createElement("p");
		identity.className = "comment-reply-identity";
		const username = document.createElement("strong");
		username.className = "comment-signed-in-user";
		username.textContent = activeCommentCredentials.username;
		identity.append(username);
		const text = document.createElement("input");
		text.type = "text";
		text.name = "reply";
		text.maxLength = 50;
		text.placeholder = "respuesta (máximo 50 caracteres)";
		text.required = true;
		const count = document.createElement("small");
		count.className = "comment-count";
		count.setAttribute("aria-live", "polite");
		count.textContent = "0/50";
		text.addEventListener("input", () => {
			count.textContent = `${text.value.length}/50`;
		});
		const buttons = document.createElement("div");
		buttons.className = "comment-management-buttons";
		const submit = document.createElement("button");
		submit.type = "submit";
		submit.textContent = "publicar respuesta";
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = "comment-cancel-button";
		cancel.textContent = "cancelar";
		buttons.append(submit, cancel);
		cancel.addEventListener("click", () => {
			management.hidden = true;
		});
		form.append(identity, text, count, buttons, status);
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			submit.disabled = true;
			status.textContent = "publicando respuesta...";
			status.classList.remove("comment-status--error");
			try {
				const result = await submitCommentReply(comment, getCommentCredentials(), text.value);
				comment.replies = [...(replies.replyData || comment.replies || []), result.reply];
				renderCommentReplies(replies, comment.replies);
				management.hidden = true;
				commentListRevision += 1;
				await loadComments();
			} catch (error) {
				status.textContent = error.message || "No se pudo publicar la respuesta.";
				status.classList.add("comment-status--error");
				submit.disabled = false;
			}
		});
		showManagementForm(form, "reply");
		text.focus();
	});
	directReply.addEventListener("click", () => replyOption.click());
	return article;
}

function closeExpandedReplies(exceptPin = null) {
	document.querySelectorAll(".comment-reply-pin.is-open").forEach((pin) => {
		if (pin === exceptPin) {
			return;
		}
		pin.dataset.pinned = "false";
		pin.querySelector(".comment-reply-text").hidden = true;
		pin.querySelector("img").hidden = false;
		pin.classList.remove("is-open");
		pin.setAttribute("aria-expanded", "false");
	});
}

document.addEventListener("click", (event) => {
	const target = event.target instanceof Element ? event.target : null;
	const currentControls = target?.closest(".comment-controls");
	const currentReply = target?.closest(".comment-reply-pin");
	document.querySelectorAll(".comment-controls").forEach((controls) => {
		if (controls !== currentControls) {
			const menu = controls.querySelector(".comment-menu");
			const toggle = controls.querySelector(".comment-menu-toggle");
			if (!menu || !toggle) {
				return;
			}
			menu.hidden = true;
			toggle.setAttribute("aria-expanded", "false");
		}
	});
	closeExpandedReplies(currentReply);
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") {
		return;
	}
	document.querySelectorAll(".comment-menu:not([hidden])").forEach((menu) => {
		menu.hidden = true;
		menu.parentElement.querySelector(".comment-menu-toggle")
			.setAttribute("aria-expanded", "false");
	});
	closeExpandedReplies();
});

window.addEventListener("blur", () => closeExpandedReplies());

let appsScriptCommentsSnapshot = null;
const isOlderCommentsPage = document.body.dataset.commentHistory === "older";

function getCommentDateKey(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return String(value).slice(0, 10);
	}
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

async function loadComments() {
	const list = document.querySelector("#comment-list");
	if (!list) {
		return;
	}
	const revision = commentListRevision;

	try {
		const result = activeCommentCredentials
			? await loadAuthenticatedComments()
			: window.COMMENTS_API_URL
				? await loadAppsScriptComments()
				: await loadLocalComments();
		if (revision !== commentListRevision) {
			return;
		}
		if (window.COMMENTS_API_URL && (result.apiVersion || 0) < 7) {
			throw new Error("El saldo de puntos y el coste de comentar requieren la versión actualizada de Apps Script. Publica la versión nueva de Code.gs.");
		}
		const today = getLocalDateTime().slice(0, 10);
		const comments = result.comments.filter((comment) => {
			const dateKey = getCommentDateKey(comment.date);
			return isOlderCommentsPage ? dateKey < today : dateKey >= today;
		});
		if (comments.length === 0) {
			list.textContent = "encara no hay comentarios";
			return;
		}
		list.replaceChildren(...comments.map(createCommentElement));
	} catch (error) {
		if (revision !== commentListRevision) {
			return;
		}
		list.textContent = error.message || (window.COMMENTS_API_URL
			? "no se van poder cargar los comentarios. Comprueba la URL y el despliegue de Apps Script"
			: "no se van poder cargar los comentarios. En GitHub Pages configura Apps Script en comments-config.js");
		console.error(error);
	}
}

async function loadAuthenticatedComments() {
	const { username, password } = activeCommentCredentials;
	if (window.COMMENTS_API_URL) {
		const api = await loadAppsScriptComments();
		if ((api.apiVersion || 0) < 7) {
			throw new Error("El historial privado y los puntos requieren la versión actualizada de Apps Script. Publica la versión nueva de Code.gs.");
		}
		const result = await submitAppsScriptRequest({
			action: "list",
			requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			username,
			password
		});
		appsScriptCommentsSnapshot = result.comments || [];
		activeCommentPoints = Number.isFinite(result.accountPoints)
			? result.accountPoints
			: null;
		updateCommentSubmissionState();
		return {
			apiVersion: api.apiVersion,
			accountPoints: activeCommentPoints,
			comments: appsScriptCommentsSnapshot
		};
	}
	const response = await fetch("/api/comments/list", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, password })
	});
	const result = await response.json();
	if (!response.ok) {
		throw Object.assign(new Error(result.error || "No se pudieron cargar los comentarios."), {
			status: response.status
		});
	}
	activeCommentPoints = Number.isFinite(result.accountPoints) ? result.accountPoints : null;
	updateCommentSubmissionState();
	return result;
}

async function loadLocalComments() {
	const response = await fetch("/api/comments");
	const result = await response.json();
	if (!response.ok) {
		throw new Error(result.error || "no se van poder cargar los comentarios");
	}
	return result;
}

function loadAppsScriptComments(timeoutMs = 15000) {
	return new Promise((resolve, reject) => {
		const callbackName = `commentsCallback${Date.now()}${Math.random().toString(36).slice(2)}`;
		const script = document.createElement("script");
		const timeout = window.setTimeout(() => {
			cleanup();
			reject(new Error("tiempo de espera agotado al consultar Apps Script"));
		}, timeoutMs);

		function cleanup() {
			window.clearTimeout(timeout);
			delete window[callbackName];
			script.remove();
		}

		window[callbackName] = (result) => {
			cleanup();
			if (result.error) {
				reject(new Error(result.error));
				return;
			}
			appsScriptCommentsSnapshot = result.comments;
			resolve(result);
		};
		script.onerror = () => {
			cleanup();
			reject(new Error("no se va poder conectar con Apps Script"));
		};
		script.src = `${window.COMMENTS_API_URL}?callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
		document.head.append(script);
	});
}

function submitAppsScriptRequest(fields, timeoutMs = 20000) {
	const iframe = document.querySelector("#comment-transport");
	const requestId = fields.requestId;
	return new Promise((resolve, reject) => {
		let settled = false;
		let reconciliationTimer;
		let reconciling = false;
		const deadline = Date.now() + timeoutMs;
		const timeout = window.setTimeout(() => finish(new Error(
			"No se pudo confirmar la respuesta de Apps Script. Comprueba que hayas publicado la versión nueva de Code.gs."
		)), timeoutMs);

		function cleanup() {
			window.clearTimeout(timeout);
			window.clearTimeout(reconciliationTimer);
			window.removeEventListener("message", handleMessage);
		}
		function finish(error, result) {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			if (error) {
				reject(error);
			} else {
				resolve(result);
			}
		}
		function handleMessage(event) {
			const isAppsScriptResponse =
				event.origin === "https://script.google.com" ||
				/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/i.test(event.origin);
			if (!isAppsScriptResponse || event.data?.requestId !== requestId) {
				return;
			}
			if (event.data.ok) {
				finish(null, event.data);
			} else {
				finish(Object.assign(new Error(event.data.error), { status: event.data.status }));
			}
		}

		window.addEventListener("message", handleMessage);
		const form = document.createElement("form");
		form.method = "post";
		form.action = window.COMMENTS_API_URL;
		form.target = iframe.name;
		form.hidden = true;
		for (const [name, value] of Object.entries(fields)) {
			const input = document.createElement("input");
			input.type = "hidden";
			input.name = name;
			input.value = value;
			form.append(input);
		}
		document.body.append(form);
		form.submit();
		form.remove();
		if (
			["edit", "delete", "reply"].includes(fields.action) &&
			fields.operation !== "load"
		) {
			reconciliationTimer = window.setTimeout(reconcileManagementRequest, 2500);
		}

		async function reconcileManagementRequest() {
			if (reconciling || settled) {
				return;
			}
			reconciling = true;
			try {
				const { comments } = await loadAuthenticatedComments();
				if (fields.action === "reply") {
					let savedReply = comments
						.flatMap((comment) => comment.replies || [])
						.find((reply) => reply.id === fields.replyId);
					if (!savedReply && fields.commentPrivate === "true") {
						try {
							const unlocked = await submitAppsScriptRequest({
								action: "unlock",
								requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
								commentId: fields.commentId,
								username: fields.username,
								password: fields.password
							}, 5000);
							savedReply = (unlocked.replies || [])
								.find((reply) => reply.id === fields.replyId);
						} catch (error) {
							console.error("No se pudo reconciliar la respuesta privada", error);
						}
					}
					if (savedReply) {
						finish(null, { ok: true, status: 201, reply: savedReply });
						return;
					}
				}
				const savedComment = fields.action === "reply"
					? null
					: comments.find((comment) =>
						comment.requestId === fields.commentId &&
						(fields.action === "delete"
							? comment.deleted
							: comment.edited &&
								comment.editedAt !== fields.previousEditedAt &&
								(comment.private || comment.comment === fields.comment))
					);
				if (savedComment) {
					finish(null, { ok: true, status: 200, comment: savedComment });
					return;
				}
			} catch (error) {
				console.error("No se pudo comprobar el resultado de la operación", error);
			} finally {
				reconciling = false;
			}
			if (!settled && Date.now() + 1500 < deadline) {
				reconciliationTimer = window.setTimeout(reconcileManagementRequest, 1500);
			}
		}
	});
}

function parseManagementCredentials(credentials) {
	const separator = credentials.indexOf(":");
	if (separator < 1 || !credentials.slice(separator + 1)) {
		throw new Error('Introduce el usuario y la contraseña separados por dos puntos (:), por ejemplo "usuario:contraseña".');
	}
	const username = credentials.slice(0, separator).trim();
	const password = credentials.slice(separator + 1);
	if (!username || !password) {
		throw new Error('Introduce el usuario y la contraseña separados por dos puntos (:), por ejemplo "usuario:contraseña".');
	}
	return { username, password };
}

async function submitCommentManagement(action, comment, credentials, text = "", operation = "") {
	const { username, password } = parseManagementCredentials(credentials);
	if (action === "edit" && operation === "save" && countLineBreaks(text) > 3) {
		throw new Error("El comentario admite como máximo 3 saltos de línea.");
	}
	if (action === "edit" && operation === "load") {
		return loadPrivateComment(comment.requestId, credentials);
	}
	const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	let result;
	if (window.COMMENTS_API_URL) {
		const api = await loadAppsScriptComments();
		if ((api.apiVersion || 0) < 7) {
			throw new Error("La edición, el borrado y el saldo de puntos requieren la versión actualizada de Apps Script. Publica la versión nueva de Code.gs.");
		}
		const previousComment = api.comments.find((entry) => entry.requestId === comment.requestId);
		result = await submitAppsScriptRequest({
			action,
			operation,
			requestId,
			commentId: comment.requestId,
			previousEditedAt: previousComment?.editedAt || "",
			username,
			password,
			credentialsProvided: "true",
			comment: text
		});
	} else {
		const response = await fetch(`/api/comments/${action}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				commentId: comment.requestId,
				username,
				password,
				credentialsProvided: true,
				comment: text,
				operation
			})
		});
		result = await response.json();
		if (!response.ok) {
			throw Object.assign(new Error(result.error || "No se pudo completar la operación."), {
				status: response.status
			});
		}
	}
	return result;
}

async function loadPrivateComment(commentId, credentials) {
	const { username, password } = parseManagementCredentials(credentials);
	const result = window.COMMENTS_API_URL
		? await unlockAppsScriptComment(commentId, `${username}:${password}`)
		: await unlockLocalComment(commentId, `${username}:${password}`);
	return { comment: result.comment, replies: result.replies || [] };
}

async function submitCommentReply(comment, credentials, text) {
	const { username, password } = parseManagementCredentials(credentials);
	if (text.length > 50) {
		throw new Error("La respuesta admite hasta 50 caracteres.");
	}
	const fields = {
		action: "reply",
		requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		replyId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		commentId: comment.requestId,
		commentPrivate: comment.private ? "true" : "false",
		username,
		password,
		reply: text
	};
	if (window.COMMENTS_API_URL) {
		const api = await loadAppsScriptComments();
		if ((api.apiVersion || 0) < 7) {
			throw new Error("Las respuestas y los puntos requieren la versión nueva de Apps Script. Publica la versión actualizada de Code.gs.");
		}
		return submitAppsScriptRequest(fields);
	}

	const response = await fetch("/api/comments/reply", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(fields)
	});
	const result = await response.json();
	if (!response.ok) {
		throw Object.assign(new Error(result.error || "No se pudo publicar la respuesta."), {
			status: response.status
		});
	}
	return result;
}

async function loginWithCredentials(credentials) {
	const { username, password } = parseManagementCredentials(credentials);
	if (window.COMMENTS_API_URL) {
		const api = await loadAppsScriptComments();
		if ((api.apiVersion || 0) < 3) {
			throw new Error("El inicio de sesión requiere la versión nueva de Apps Script. Publica la versión actualizada de Code.gs.");
		}
		return submitAppsScriptRequest({
			action: "login",
			requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			username,
			password
		});
	}

	const response = await fetch("/api/comments/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ credentials: `${username}:${password}` })
	});
	const result = await response.json();
	if (!response.ok) {
		throw Object.assign(new Error(result.error || "No se pudo iniciar sesión."), {
			status: response.status
		});
	}
	return result;
}

async function unlockLocalComment(requestId, credentials) {
	const response = await fetch("/api/comments/unlock", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ requestId, credentials })
	});
	const result = await response.json();
	if (!response.ok) {
		throw Object.assign(new Error(result.error || "no se pudo mostrar el comentario"), {
			status: response.status
		});
	}
	return { comment: result.comment, replies: result.replies || [] };
}

async function unlockAppsScriptComment(commentId, credentials) {
	const separator = credentials.indexOf(":");
	const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const result = await submitAppsScriptRequest({
		action: "unlock",
		requestId,
		commentId,
		username: separator === -1 ? credentials : credentials.slice(0, separator).trim(),
		password: separator === -1 ? "" : credentials.slice(separator + 1)
	});
	return { comment: result.comment, replies: result.replies || [] };
}

let commentListRevision = 0;

async function submitAppsScriptComment(credentials, comment) {
	const iframe = document.querySelector("#comment-transport");
	const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const api = await loadAppsScriptComments();
	if ((api.apiVersion || 0) < 7) {
		throw new Error("El coste de comentar requiere la versión actualizada de Apps Script. Publica la versión nueva de Code.gs.");
	}
	const previousComments = appsScriptCommentsSnapshot ||
		(await loadAuthenticatedComments()).comments;
	const recipientSeparator = credentials.lastIndexOf("@");
	const recipientProvided = recipientSeparator >= 0;
	const senderCredentials = recipientProvided ? credentials.slice(0, recipientSeparator) : credentials;
	const recipient = recipientProvided ? credentials.slice(recipientSeparator + 1).trim() : "";
	const separator = senderCredentials.indexOf(":");
	const username = (separator === -1 ? senderCredentials : senderCredentials.slice(0, separator)).trim();

	return new Promise((resolve, reject) => {
		let settled = false;
		let fallbackTimer;
		let fallbackAttempts = 0;
		let checkingComments = false;
		const timeout = window.setTimeout(() => {
			finishWithError(new Error("no se pudo confirmar el envío. comprueba la conexión a la xarxa e inténtalo otra vez"));
		}, 20000);

		function cleanup() {
			window.clearTimeout(timeout);
			window.clearTimeout(fallbackTimer);
			window.removeEventListener("message", handleMessage);
			iframe.removeEventListener("load", handleFrameLoad);
		}

		function finishWithError(error) {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			reject(error);
		}

		function finishWithComment(savedComment) {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			resolve(savedComment);
		}

		function handleMessage(event) {
			const isAppsScriptResponse =
				event.origin === "https://script.google.com" ||
				/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/i.test(event.origin);
			if (
				!isAppsScriptResponse ||
				event.data?.requestId !== requestId
			) {
				return;
			}
			if (event.data.ok) {
				finishWithComment(event.data.comment);
			} else {
				finishWithError(Object.assign(new Error(event.data.error), { status: event.data.status }));
			}
		}

		async function reconcileSavedComment() {
			if (settled || checkingComments) {
				return;
			}
			checkingComments = true;
			try {
				const { comments } = await loadAuthenticatedComments();
				const savedComment = comments.find((entry) => entry.requestId === requestId) ||
					comments.find((entry) =>
						entry.name === username &&
						entry.comment === comment &&
						entry.private === recipientProvided &&
						!previousComments.some((previous) =>
							previous.date === entry.date &&
							previous.name === entry.name &&
							previous.comment === entry.comment
						)
					);
				if (savedComment) {
					finishWithComment(savedComment);
					return;
				}
			} catch (error) {
				console.error("no se pudo verificar todavía el comentario guardado", error);
			} finally {
				checkingComments = false;
			}

			fallbackAttempts += 1;
			if (fallbackAttempts < 12 && !settled) {
				fallbackTimer = window.setTimeout(reconcileSavedComment, 750);
			}
		}

		function handleFrameLoad() {
			window.clearTimeout(fallbackTimer);
			reconcileSavedComment();
		}

		window.addEventListener("message", handleMessage);
		iframe.addEventListener("load", handleFrameLoad);
		const form = document.createElement("form");
		form.method = "post";
		form.action = window.COMMENTS_API_URL;
		form.target = iframe.name;
		form.hidden = true;

		for (const [name, value] of Object.entries({
			username,
			password: separator === -1 ? "" : senderCredentials.slice(separator + 1),
			recipient,
			recipientProvided: String(recipientProvided),
			comment,
			requestId
		})) {
			const input = document.createElement("input");
			input.type = "hidden";
			input.name = name;
			input.value = value;
			form.append(input);
		}

		document.body.append(form);
		form.submit();
		form.remove();
		if (!settled) {
			fallbackTimer = window.setTimeout(reconcileSavedComment, 500);
		}
	});
}

const commentForm = document.querySelector("#comment-form");
if (commentForm) {
	const passwordInput = document.querySelector("#comment-name");
	const togglePassword = document.querySelector("#toggle-password");
	const loginButton = document.querySelector("#login-button");
	const loginStatus = document.querySelector("#login-status");
	window.addEventListener("pageshow", () => {
		if (!activeCommentCredentials) {
			passwordInput.value = "";
		}
	});
	loginButton.addEventListener("click", async () => {
		loginStatus.textContent = "comprobando credenciales...";
		loginStatus.classList.remove("comment-status--error", "comment-status--success");
		loginButton.disabled = true;
		try {
			const result = await loginWithCredentials(passwordInput.value);
			const persisted = rememberCommentCredentials(passwordInput.value);
			await loadComments();
			loginStatus.textContent = persisted
				? `Sesión iniciada como ${result.username || activeCommentCredentials.username}.`
				: `Sesión iniciada como ${result.username || activeCommentCredentials.username}, pero no se pudo guardar en este navegador.`;
			loginStatus.classList.add("comment-status--success");
			passwordInput.type = "password";
			togglePassword.textContent = "Mostrar";
			togglePassword.setAttribute("aria-pressed", "false");
		} catch (error) {
			loginStatus.textContent = error.message || "No se pudo iniciar sesión. Comprueba tus credenciales e inténtalo de nuevo.";
			loginStatus.classList.add("comment-status--error");
			console.error(error);
		} finally {
			loginButton.disabled = false;
		}
	});
	passwordInput.addEventListener("input", () => {
		loginStatus.textContent = "";
		loginStatus.classList.remove("comment-status--error", "comment-status--success");
	});
	togglePassword.addEventListener("click", () => {
		const showingPassword = passwordInput.type === "password";
		passwordInput.type = showingPassword ? "text" : "password";
		togglePassword.textContent = showingPassword ? "Ocultar" : "Mostrar";
		togglePassword.setAttribute("aria-pressed", String(showingPassword));
	});

	const commentInput = document.querySelector("#comment-text");
	const commentCount = document.querySelector("#comment-count");
	const recipientInput = document.querySelector("#comment-recipient");
	commentInput.addEventListener("input", () => {
		commentCount.textContent = `${commentInput.value.length}/280`;
		updateCommentSubmissionState();
	});
	recipientInput.addEventListener("input", updateCommentSubmissionState);

	commentForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		const status = document.querySelector("#comment-status");
		if (!requireCommentLogin(status)) {
			return;
		}
		const credentials = getCommentCredentials();
		const recipient = document.querySelector("#comment-recipient").value.trim();
		const credentialsWithRecipient = recipient
			? `${credentials}@${recipient}`
			: credentials;
		const commentText = commentInput.value;
		if (countLineBreaks(commentText) > 3) {
			status.classList.add("comment-status--error");
			status.textContent = "El comentario admite como máximo 3 saltos de línea.";
			return;
		}
		const submitButton = commentForm.querySelector("button[type='submit']");
		status.textContent = "Publicando...";
		status.classList.remove("comment-status--error");
		commentSubmissionInProgress = true;
		submitButton.disabled = true;

		try {
			if (window.COMMENTS_API_URL) {
				await submitAppsScriptComment(
					credentialsWithRecipient,
					commentText
				);
			} else {
				const response = await fetch("/api/comments", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: credentialsWithRecipient,
						comment: commentText,
						requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
						recipientProvided: String(Boolean(recipient))
					})
				});
				const result = await response.json();
				if (!response.ok) {
					throw Object.assign(new Error(result.error || "no se pudo guardar el comentario"), {
						status: response.status
					});
				}
			}

			status.classList.remove("comment-status--error");
			commentListRevision += 1;
			commentForm.reset();
			await loadComments();
			commentCount.textContent = "0/280";
			status.textContent = "comentario publicado";
		} catch (error) {
			if (error.status === 401) {
				status.classList.add("comment-status--error");
				status.textContent = error.message || "usuario inexistente. tienes que contactar con Andrés para conseguir un usuario y contraseña y así poder comentar";
			} else {
				status.classList.add("comment-status--error");
				status.textContent = error.message || "no se pudo guardar el comentario... lo siento wei. inténtalo otra vez!!!";
			}
			console.error(error);
		} finally {
			commentSubmissionInProgress = false;
			updateCommentSubmissionState();
		}
	});

	updateCommentSubmissionState();
}

async function restoreCommentSession() {
	let savedSession;
	try {
		const serialized = localStorage.getItem(commentSessionStorageKey);
		if (!serialized) {
			return;
		}
		savedSession = JSON.parse(serialized);
		if (
			!savedSession ||
			typeof savedSession.username !== "string" ||
			typeof savedSession.password !== "string"
		) {
			throw new Error("El formato de la sesión guardada no es válido.");
		}
	} catch (error) {
		console.error("No se pudo leer la sesión guardada.", error);
		clearStoredCommentSession();
		return;
	}

	const credentials = `${savedSession.username}:${savedSession.password}`;
	try {
		const result = await loginWithCredentials(credentials);
		rememberCommentCredentials(credentials);
		const loginStatus = document.querySelector("#login-status");
		if (loginStatus) {
			loginStatus.textContent = `Sesión restaurada como ${result.username || savedSession.username}.`;
			loginStatus.classList.add("comment-status--success");
		}
	} catch (error) {
		if (error.status === 401) {
			clearStoredCommentSession();
			const loginStatus = document.querySelector("#login-status");
			if (loginStatus) {
				loginStatus.textContent = "La sesión guardada ya no es válida. Inicia sesión de nuevo.";
				loginStatus.classList.add("comment-status--error");
			}
		} else {
			console.error("No se pudo restaurar la sesión guardada.", error);
			const loginStatus = document.querySelector("#login-status");
			if (loginStatus) {
				loginStatus.textContent = "No se pudo comprobar la sesión guardada. Se intentará de nuevo en otra visita.";
				loginStatus.classList.add("comment-status--error");
			}
		}
	}
}

function initializeFeaturedVideo() {
	const iframe = document.querySelector("#featured-video");
	const activationButton = document.querySelector("#video-activate");
	if (!(iframe instanceof HTMLIFrameElement) || !(activationButton instanceof HTMLButtonElement)) {
		return;
	}

	const iframeUrl = new URL(iframe.src);
	iframeUrl.searchParams.set("origin", window.location.origin);
	iframe.src = iframeUrl.href;

	let player = null;
	let playRequested = false;
	let playbackTimeout;
	const status = activationButton.querySelector("span");
	const showError = (message) => {
		activationButton.disabled = true;
		if (status) {
			status.textContent = message;
		}
	};

	activationButton.addEventListener("click", () => {
		playRequested = true;
		activationButton.disabled = true;
		if (status) {
			status.textContent = "cargando vídeo...";
		}
		player?.playVideo();
		window.clearTimeout(playbackTimeout);
		playbackTimeout = window.setTimeout(() => {
			if (!activationButton.hidden && (!window.YT || !player || player.getPlayerState() !== window.YT.PlayerState.PLAYING)) {
				activationButton.disabled = false;
				if (status) {
					status.textContent = "No se pudo iniciar. Pulsa para reintentar.";
				}
			}
		}, 10000);
	});

	window.onYouTubeIframeAPIReady = () => {
		player = new window.YT.Player(iframe, {
			events: {
				onReady: (event) => {
					event.target.mute();
					if (event.target.getPlayerState() === window.YT.PlayerState.PLAYING) {
						activationButton.hidden = true;
					} else if (playRequested) {
						event.target.playVideo();
					}
				},
				onStateChange: (event) => {
					if (event.data === window.YT.PlayerState.PLAYING) {
						window.clearTimeout(playbackTimeout);
						activationButton.hidden = true;
					}
				},
				onError: () => showError("No se pudo cargar el vídeo.")
			}
		});
	};

	const apiScript = document.createElement("script");
	apiScript.src = "https://www.youtube.com/iframe_api";
	apiScript.onerror = () => showError("No se pudo cargar el vídeo.");
	document.head.append(apiScript);
}

initializeFeaturedVideo();

if (document.querySelector("#comment-list")) {
	restoreCommentSession().finally(loadComments);
} else if (document.querySelector("[data-history-file]")) {
	restoreCommentSession();
}
