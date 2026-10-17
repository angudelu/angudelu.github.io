const COMMENTS_SHEET_NAME = "Comentarios";
const COMMENTS_SPREADSHEET_PROPERTY = "COMMENTS_SPREADSHEET_ID";
const COMMENTS_USERS_PROPERTY = "COMMENTS_USERS";
const COMMENTS_PEPPER_PROPERTY = "COMMENTS_PEPPER";
const INITIAL_USERS_PROPERTY = "INITIAL_USERS_JSON";
const MAX_COMMENT_LENGTH = 1200;
const MAX_USERNAME_LENGTH = 60;
const MAX_COMMENTS_PER_MINUTE = 5;

function setup() {
  const properties = PropertiesService.getScriptProperties();
  const allowedOrigin = properties.getProperty("ALLOWED_ORIGIN");
  if (!allowedOrigin || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(allowedOrigin)) {
    throw new Error(
      "Configura ALLOWED_ORIGIN con el origen HTTPS de GitHub Pages, sin ruta ni barra final."
    );
  }

  let spreadsheetId = properties.getProperty(COMMENTS_SPREADSHEET_PROPERTY);
  let spreadsheet;

  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create("Comentarios de la web");
    spreadsheetId = spreadsheet.getId();
    properties.setProperty(COMMENTS_SPREADSHEET_PROPERTY, spreadsheetId);
  }

  let sheet = spreadsheet.getSheetByName(COMMENTS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(COMMENTS_SHEET_NAME);
    sheet.appendRow(["fecha", "usuario", "comentario", "id_solicitud"]);
  } else if (sheet.getRange(1, 4).getValue() !== "id_solicitud") {
    sheet.getRange(1, 4).setValue("id_solicitud");
  }

  if (!properties.getProperty(COMMENTS_USERS_PROPERTY)) {
    const initialUsersJson = properties.getProperty(INITIAL_USERS_PROPERTY);
    if (!initialUsersJson) {
      throw new Error(
        "Añade INITIAL_USERS_JSON a las propiedades del script antes de ejecutar setup."
      );
    }

    const initialUsers = JSON.parse(initialUsersJson);
    if (!initialUsers || typeof initialUsers !== "object" || Array.isArray(initialUsers)) {
      throw new Error("INITIAL_USERS_JSON debe ser un objeto JSON de usuarios y contraseñas.");
    }

    const pepper = Utilities.getUuid() + Utilities.getUuid();
    const users = {};
    Object.keys(initialUsers).forEach((username) => {
      const password = initialUsers[username];
      if (
        !username ||
        username.length > MAX_USERNAME_LENGTH ||
        typeof password !== "string" ||
        !password
      ) {
        throw new Error("Cada usuario debe tener un nombre y una contraseña no vacíos.");
      }

      const salt = Utilities.getUuid();
      users[username] = {
        salt: salt,
        hash: hashPassword_(username, password, salt, pepper)
      };
    });

    properties.setProperties({
      [COMMENTS_USERS_PROPERTY]: JSON.stringify(users),
      [COMMENTS_PEPPER_PROPERTY]: pepper
    });
    properties.deleteProperty(INITIAL_USERS_PROPERTY);
  }

  Logger.log("Hoja privada de comentarios creada: " + spreadsheet.getUrl());
}

function doGet(event) {
  const callback = event && event.parameter && event.parameter.callback;
  if (!callback || !/^[A-Za-z_$][\w$]{0,80}$/.test(callback)) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: "Callback no válido." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const comments = readComments_();
    const body = callback + "(" + JSON.stringify({ comments: comments }) + ");";
    return ContentService.createTextOutput(body)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (error) {
    console.error(error);
    const body = callback + "(" + JSON.stringify({
      error: "No se pudieron cargar los comentarios."
    }) + ");";
    return ContentService.createTextOutput(body)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

function doPost(event) {
  const parameters = event && event.parameter ? event.parameter : {};
  const requestId = String(parameters.requestId || "");
  if (!/^[\w-]{1,100}$/.test(requestId)) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: "Solicitud no válida."
    });
  }

  const username = String(parameters.username || "").trim();
  const password = String(parameters.password || "");
  const comment = String(parameters.comment || "").trim();
  let isAuthorized;
  try {
    isAuthorized = verifyUser_(username, password);
  } catch (error) {
    console.error(error);
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 500,
      error: "No se pudo verificar el usuario. Inténtalo más tarde."
    });
  }
  if (!isAuthorized) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 401,
      error: "Tienes que escribirme a mí para conseguir un usuario y contraseña y así poder comentar."
    });
  }

  if (!comment) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: "Escribe un comentario."
    });
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: "El comentario admite hasta 1200 caracteres."
    });
  }
  if (isRateLimited_(username)) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 429,
      error: "Has publicado demasiados comentarios. Inténtalo más tarde."
    });
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty(COMMENTS_SPREADSHEET_PROPERTY);
    if (!spreadsheetId) {
      throw new Error("Ejecuta setup() antes de aceptar comentarios.");
    }
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(COMMENTS_SHEET_NAME);
    if (!sheet) {
      throw new Error("No existe la hoja de comentarios.");
    }

    const commentRecord = {
      date: new Date().toISOString(),
      name: username,
      comment: comment,
      requestId: requestId
    };
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.appendRow([
        commentRecord.date,
        commentRecord.name,
        commentRecord.comment,
        commentRecord.requestId
      ]);
    } finally {
      lock.releaseLock();
    }

    return postMessageResponse_({
      requestId: requestId,
      ok: true,
      status: 201,
      comment: commentRecord
    });
  } catch (error) {
    console.error(error);
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 500,
      error: "No se pudo guardar el comentario. Inténtalo más tarde."
    });
  }
}

function readComments_() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(COMMENTS_SPREADSHEET_PROPERTY);
  if (!spreadsheetId) {
    throw new Error("Ejecuta setup() antes de cargar comentarios.");
  }

  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(COMMENTS_SHEET_NAME);
  if (!sheet) {
    throw new Error("No existe la hoja de comentarios.");
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, 4).getValues()
    .filter((row) => row[0] && row[1] && row[2])
    .reverse()
    .map((row) => ({
      date: row[0] instanceof Date ? row[0].toISOString() : String(row[0]),
      name: String(row[1]),
      comment: String(row[2]),
      requestId: String(row[3] || "")
    }));
}

function verifyUser_(username, password) {
  if (!username || username.length > MAX_USERNAME_LENGTH || !password) {
    return false;
  }

  const properties = PropertiesService.getScriptProperties();
  const usersJson = properties.getProperty(COMMENTS_USERS_PROPERTY);
  const pepper = properties.getProperty(COMMENTS_PEPPER_PROPERTY);
  if (!usersJson || !pepper) {
    throw new Error("No hay usuarios configurados. Ejecuta setup().");
  }

  const users = JSON.parse(usersJson);
  const user = users[username];
  if (!user) {
    return false;
  }
  return constantTimeEquals_(
    hashPassword_(username, password, user.salt, pepper),
    user.hash
  );
}

function hashPassword_(username, password, salt, pepper) {
  const signature = Utilities.computeHmacSha256Signature(
    username + ":" + salt + ":" + password,
    pepper,
    Utilities.Charset.UTF_8
  );
  return signature.map((byte) => ((byte + 256) % 256).toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals_(first, second) {
  if (typeof first !== "string" || typeof second !== "string" || first.length !== second.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}

function isRateLimited_(username) {
  const cache = CacheService.getScriptCache();
  const key = "comment-rate-" + hashPassword_(username, "rate-limit", "key", "local");
  const count = Number(cache.get(key) || "0");
  if (count >= MAX_COMMENTS_PER_MINUTE) {
    return true;
  }
  cache.put(key, String(count + 1), 60);
  return false;
}

function postMessageResponse_(message) {
  const serializedMessage = JSON.stringify(message).replace(/</g, "\\u003c");
  const allowedOrigin = PropertiesService.getScriptProperties()
    .getProperty("ALLOWED_ORIGIN");
  if (!allowedOrigin) {
    throw new Error("Configura ALLOWED_ORIGIN antes de recibir comentarios.");
  }
  const html = "<!doctype html><html><body><script>" +
    "window.top.postMessage(" + serializedMessage + "," +
    JSON.stringify(allowedOrigin) + ");" +
    "</script></body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
