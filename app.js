function getLocalDateTime() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parsePosts(contents) {
	const posts = [];
	const entryPattern = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?\|/gm;
	const entries = [...contents.matchAll(entryPattern)];
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		const [, normalizedDate, hour = "00", minute = "00"] = entry;
		const contentStart = entry.index + entry[0].length;
		const contentEnd = entries[index + 1]?.index ?? contents.length;
		let content = contents.slice(contentStart, contentEnd).trim();
		const [year, month, day] = normalizedDate.split("-").map(Number);
		const hours = Number(hour);
		const minutes = Number(minute);
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
				dateTime: `${normalizedDate}T${hour}:${minute}`,
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
		const url = new URL(value, document.baseURI);
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

function createPostElement(post) {
	const container = document.createElement("article");
	container.className = "history-post";

	const dateElement = document.createElement("time");
	dateElement.className = "post-date";
	dateElement.dateTime = post.dateTime;
	dateElement.textContent = `${post.date} ${post.time}`;
	container.append(dateElement);

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

	return container;
}

async function fetchPosts(file) {
	const response = await fetch(file);
	if (!response.ok) {
		throw new Error(`no se va poder cargar ${file} (${response.status})`);
	}
	return parsePosts(await response.text());
}

async function loadGridText(element, date) {
	const file = element.dataset.textFile;
	try {
		const posts = await fetchPosts(file);
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

function createCommentElement(comment) {
	const article = document.createElement("article");
	article.className = "comment";

	const header = document.createElement("div");
	header.className = "comment-header";

	const name = document.createElement("strong");
	name.className = "comment-name";
	name.textContent = comment.private && comment.recipient
		? `${comment.name}@${comment.recipient}`
		: comment.name;
	header.append(name);

	const date = document.createElement("time");
	date.className = "comment-date";
	date.dateTime = comment.date;
	date.textContent = new Intl.DateTimeFormat("es-ES", {
		dateStyle: "medium",
		timeStyle: "short"
	}).format(new Date(comment.date));
	header.append(date);

	article.append(header);
	if (comment.private) {
		article.classList.add("comment--private");
		const cover = document.createElement("div");
		cover.className = "private-comment-cover";
		cover.setAttribute("aria-label", "Comentario privado");

		const prompt = document.createElement("p");
		prompt.textContent = "comentario privado. introdueix usuario:contraseña del remitente o destinatario para mostrarlo";
		const form = document.createElement("form");
		form.className = "private-comment-form";
		const credentials = document.createElement("input");
		credentials.type = "password";
		credentials.name = "credentials";
		credentials.autocomplete = "current-password";
		credentials.placeholder = "usuario:contraseña";
		credentials.required = true;
		const unlock = document.createElement("button");
		unlock.type = "submit";
		unlock.textContent = "mostrar comentario";
		const status = document.createElement("small");
		status.className = "private-comment-status";
		status.setAttribute("role", "status");
		form.append(credentials, unlock, status);
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			unlock.disabled = true;
			status.textContent = "comprovando...";
			status.classList.remove("comment-status--error");
			try {
				const text = window.COMMENTS_API_URL
					? await unlockAppsScriptComment(comment.requestId, credentials.value)
					: await unlockLocalComment(comment.requestId, credentials.value);
				const paragraph = document.createElement("p");
				paragraph.className = "comment-text";
				paragraph.textContent = text;
				cover.replaceWith(paragraph);
			} catch (error) {
				status.textContent = error.message || "no se va poder mostrar el comentario";
				status.classList.add("comment-status--error");
				unlock.disabled = false;
			}
		});
		cover.append(prompt, form);
		article.append(cover);
	} else {
		const text = document.createElement("p");
		text.className = "comment-text";
		text.textContent = comment.comment;
		article.append(text);
	}
	return article;
}

let appsScriptCommentsSnapshot = null;

async function loadComments() {
	const list = document.querySelector("#comment-list");
	if (!list) {
		return;
	}
	const revision = commentListRevision;

	try {
		const result = window.COMMENTS_API_URL
			? await loadAppsScriptComments()
			: await loadLocalComments();
		if (revision !== commentListRevision) {
			return;
		}
		if (window.COMMENTS_API_URL) {
			appsScriptCommentsSnapshot = result.comments;
		}
		if (result.comments.length === 0) {
			list.textContent = "encara no hay comentarios";
			return;
		}
		list.replaceChildren(...result.comments.map(createCommentElement));
	} catch (error) {
		if (revision !== commentListRevision) {
			return;
		}
		list.textContent = window.COMMENTS_API_URL
			? "no se van poder cargar los comentarios. Comprueba la URL y el despliegue de Apps Script"
			: "no se van poder cargar los comentarios. En GitHub Pages configura Apps Script en comments-config.js";
		console.error(error);
	}
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
		const timeout = window.setTimeout(() => finish(new Error("Apps Script no respondió. inténtalo de nuevo")), timeoutMs);

		function cleanup() {
			window.clearTimeout(timeout);
			window.removeEventListener("message", handleMessage);
		}
		function finish(error, result) {
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
	});
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
	return result.comment;
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
	return result.comment;
}

let commentListRevision = 0;

async function submitAppsScriptComment(credentials, comment) {
	const iframe = document.querySelector("#comment-transport");
	const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const previousComments = appsScriptCommentsSnapshot || (await loadAppsScriptComments()).comments;
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
				const { comments } = await loadAppsScriptComments(5000);
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
	togglePassword.addEventListener("click", () => {
		const showingPassword = passwordInput.type === "password";
		passwordInput.type = showingPassword ? "text" : "password";
		togglePassword.textContent = showingPassword ? "Ocultar" : "Mostrar";
		togglePassword.setAttribute("aria-pressed", String(showingPassword));
	});

	const commentInput = document.querySelector("#comment-text");
	const commentCount = document.querySelector("#comment-count");
	commentInput.addEventListener("input", () => {
		commentCount.textContent = `${commentInput.value.length}/280`;
	});

	commentForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		const formData = new FormData(commentForm);
		const status = document.querySelector("#comment-status");
		const submitButton = commentForm.querySelector("button[type='submit']");
		status.textContent = "Publicando...";
		status.classList.remove("comment-status--error");
		submitButton.disabled = true;

		try {
			let comment;
			if (window.COMMENTS_API_URL) {
				comment = await submitAppsScriptComment(
					String(formData.get("name")),
					String(formData.get("comment"))
				);
			} else {
				const response = await fetch("/api/comments", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: formData.get("name"),
						comment: formData.get("comment"),
						requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
						recipientProvided: String(String(formData.get("name")).includes("@"))
					})
				});
				const result = await response.json();
				if (!response.ok) {
					throw Object.assign(new Error(result.error || "no se pudo guardar el comentario"), {
						status: response.status
					});
				}
				comment = result.comment;
			}

			status.classList.remove("comment-status--error");
			commentListRevision += 1;
			const list = document.querySelector("#comment-list");
			if (!list.querySelector(".comment")) {
				list.replaceChildren();
			}
			list.prepend(createCommentElement(comment));
			commentForm.reset();
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
			submitButton.disabled = false;
		}
	});

	loadComments();
}
