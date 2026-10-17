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

async function loadComments() {
	const list = document.querySelector("#comment-list");
	if (!list) {
		return;
	}

	try {
		const response = await fetch("/api/comments");
		const result = await response.json();
		if (!response.ok) {
			throw new Error(result.error || "No se pudieron cargar los comentarios.");
		}
		if (result.comments.length === 0) {
			list.textContent = "Todavía no hay comentarios.";
			return;
		}
		list.replaceChildren(...result.comments.map(createCommentElement));
	} catch (error) {
		list.textContent = "No se pudieron cargar los comentarios. Inicia la web con «python server.py».";
		console.error(error);
	}
}

const commentForm = document.querySelector("#comment-form");
if (commentForm) {
	commentForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		const formData = new FormData(commentForm);
		const status = document.querySelector("#comment-status");
		const submitButton = commentForm.querySelector("button[type='submit']");
		status.textContent = "Publicando...";
		submitButton.disabled = true;

		try {
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
				status.classList.toggle("comment-status--error", response.status === 401);
				throw new Error(result.error || "No se pudo guardar el comentario.");
			}

			status.classList.remove("comment-status--error");
			const list = document.querySelector("#comment-list");
			if (!list.querySelector(".comment")) {
				list.replaceChildren();
			}
			list.prepend(createCommentElement(result.comment));
			commentForm.reset();
			status.textContent = "Comentario publicado.";
		} catch (error) {
			if (!status.classList.contains("comment-status--error")) {
				status.classList.remove("comment-status--error");
			}
			status.textContent = error.message || "No se pudo guardar el comentario.";
			console.error(error);
		} finally {
			submitButton.disabled = false;
		}
	});

	loadComments();
}
