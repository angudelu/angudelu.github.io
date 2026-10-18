function getLocalDate() {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function parsePosts(contents) {
	const posts = [];
	for (const line of contents.split(/\r?\n/)) {
		if (line.trim().startsWith("#")) {
			continue;
		}

		const [entryDate = "", text = "", image = "", link = ""] = line.split("|");
		const normalizedDate = entryDate.trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
			continue;
		}
		const [year, month, day] = normalizedDate.split("-").map(Number);
		const parsedDate = new Date(Date.UTC(year, month - 1, day));
		if (
			parsedDate.getUTCFullYear() !== year ||
			parsedDate.getUTCMonth() !== month - 1 ||
			parsedDate.getUTCDate() !== day
		) {
			continue;
		}

		if (text.trim() || image.trim()) {
			posts.push({
				date: normalizedDate,
				text: text.trim(),
				image: image.trim(),
				link: link.trim()
			});
		}
	}
	return posts.sort((first, second) => second.date.localeCompare(first.date));
}

function getPostForDate(posts, date) {
	return posts.find((post) => post.date <= date) ?? null;
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

function createPostElement(post) {
	const container = document.createElement("article");
	container.className = "history-post";

	const dateElement = document.createElement("time");
	dateElement.className = "post-date";
	dateElement.dateTime = post.date;
	dateElement.textContent = post.date;
	container.append(dateElement);

	if (post.text) {
		const textElement = document.createElement("p");
		textElement.className = "post-text";
		textElement.textContent = post.text;
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
		throw new Error(`No se pudo cargar ${file} (${response.status})`);
	}
	return parsePosts(await response.text());
}

async function loadGridText(element, date) {
	const file = element.dataset.textFile;
	try {
		const posts = await fetchPosts(file);
		const post = getPostForDate(posts, date);
		if (!post) {
			element.textContent = `No hay publicaciones anteriores o programadas para el ${date}.`;
			return;
		}
		element.replaceChildren(createPostElement(post));
	} catch (error) {
		element.textContent = `No se pudo cargar ${file}. Comprueba que el archivo exista y que la página se sirva desde un servidor web.`;
		console.error(error);
	}
}

const today = getLocalDate();
document.querySelectorAll(".grid-text").forEach((element) => {
	loadGridText(element, today);
});

document.querySelectorAll("[data-history-file]").forEach(async (element) => {
	const file = element.dataset.historyFile;
	try {
		const posts = (await fetchPosts(file)).filter((post) => post.date <= today);
		if (posts.length === 0) {
			element.textContent = "Todavía no hay publicaciones en este historial.";
			return;
		}
		element.replaceChildren(...posts.map(createPostElement));
	} catch (error) {
		element.textContent = `No se pudo cargar ${file}. Comprueba que el archivo exista y que la página se sirva desde un servidor web.`;
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
	name.textContent = comment.name;
	header.append(name);

	const date = document.createElement("time");
	date.className = "comment-date";
	date.dateTime = comment.date;
	date.textContent = new Intl.DateTimeFormat("es-ES", {
		dateStyle: "medium",
		timeStyle: "short"
	}).format(new Date(comment.date));
	header.append(date);

	const text = document.createElement("p");
	text.className = "comment-text";
	text.textContent = comment.comment;

	article.append(header, text);
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
			list.textContent = "Todavía no hay comentarios.";
			return;
		}
		list.replaceChildren(...result.comments.map(createCommentElement));
	} catch (error) {
		if (revision !== commentListRevision) {
			return;
		}
		list.textContent = window.COMMENTS_API_URL
			? "No se pudieron cargar los comentarios. Comprueba la URL y el despliegue de Apps Script."
			: "No se pudieron cargar los comentarios. En GitHub Pages configura Apps Script en comments-config.js.";
		console.error(error);
	}
}

async function loadLocalComments() {
	const response = await fetch("/api/comments");
	const result = await response.json();
	if (!response.ok) {
		throw new Error(result.error || "No se pudieron cargar los comentarios.");
	}
	return result;
}

function loadAppsScriptComments(timeoutMs = 15000) {
	return new Promise((resolve, reject) => {
		const callbackName = `commentsCallback${Date.now()}${Math.random().toString(36).slice(2)}`;
		const script = document.createElement("script");
		const timeout = window.setTimeout(() => {
			cleanup();
			reject(new Error("Tiempo de espera agotado al consultar Apps Script."));
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
			reject(new Error("No se pudo conectar con Apps Script."));
		};
		script.src = `${window.COMMENTS_API_URL}?callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
		document.head.append(script);
	});
}

let commentListRevision = 0;

async function submitAppsScriptComment(credentials, comment) {
	const iframe = document.querySelector("#comment-transport");
	const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const previousComments = appsScriptCommentsSnapshot || (await loadAppsScriptComments()).comments;
	const username = credentials.slice(0, credentials.indexOf(":"));

	return new Promise((resolve, reject) => {
		let settled = false;
		let fallbackTimer;
		let fallbackAttempts = 0;
		let checkingComments = false;
		const timeout = window.setTimeout(() => {
			finishWithError(new Error("No se pudo confirmar el envío. Comprueba la conexión e inténtalo otra vez."));
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
				console.error("No se pudo verificar todavía el comentario guardado.", error);
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
			password: credentials.slice(credentials.indexOf(":") + 1),
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
						comment: formData.get("comment")
					})
				});
				const result = await response.json();
				if (!response.ok) {
					throw Object.assign(new Error(result.error || "No se pudo guardar el comentario."), {
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
			status.textContent = "Comentario publicado.";
		} catch (error) {
			if (error.status === 401) {
				status.classList.add("comment-status--error");
				status.textContent = "Tienes que escribirme a mí para conseguir un usuario y contraseña y así poder comentar.";
			} else {
				status.classList.remove("comment-status--error");
				status.textContent = error.message || "No se pudo guardar el comentario.";
			}
			console.error(error);
		} finally {
			submitButton.disabled = false;
		}
	});

	loadComments();
}
