const COMMENTS_SHEET_NAME = "Comentarios";
const COMMENTS_SPREADSHEET_PROPERTY = "COMMENTS_SPREADSHEET_ID";
const COMMENTS_USERS_PROPERTY = "COMMENTS_USERS";
const COMMENTS_PEPPER_PROPERTY = "COMMENTS_PEPPER";
const INITIAL_USERS_PROPERTY = "INITIAL_USERS_JSON";
const NEW_USERS_PROPERTY = "NEW_USERS_JSON";
const MAX_COMMENT_LENGTH = 280;
const MAX_USERNAME_LENGTH = 60;
const MAX_CREDENTIALS_LENGTH = 160;
const MAX_COMMENTS_PER_DAY = 10;
const INVALID_RECIPIENT_MESSAGE = "destinatario no existente";

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
  }
  sheet.getRange(1, 1, 1, 9).setValues([[
    "fecha", "usuario", "comentario", "id_solicitud", "destinatario", "privado",
    "editado", "eliminado", "respuestas"
  ]]);

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

function addUsers() {
  const properties = PropertiesService.getScriptProperties();
  const newUsersJson = properties.getProperty(NEW_USERS_PROPERTY);
  if (!newUsersJson) {
    throw new Error("Añade NEW_USERS_JSON a las propiedades del script antes de ejecutar addUsers.");
  }

  const usersToAdd = JSON.parse(newUsersJson);
  if (!usersToAdd || typeof usersToAdd !== "object" || Array.isArray(usersToAdd)) {
    throw new Error("NEW_USERS_JSON debe ser un objeto JSON de usuarios y contraseñas.");
  }

  const usersJson = properties.getProperty(COMMENTS_USERS_PROPERTY);
  const pepper = properties.getProperty(COMMENTS_PEPPER_PROPERTY);
  if (!usersJson || !pepper) {
    throw new Error("No hay usuarios configurados. Ejecuta setup() primero.");
  }

  const users = JSON.parse(usersJson);
  const usernames = Object.keys(usersToAdd);
  if (usernames.length === 0) {
    throw new Error("NEW_USERS_JSON debe contener al menos un usuario.");
  }

  usernames.forEach((username) => {
    const password = usersToAdd[username];
    if (
      !username ||
      username !== username.trim() ||
      username.includes(":") ||
      username.length > MAX_USERNAME_LENGTH ||
      typeof password !== "string" ||
      !password
    ) {
      throw new Error("Cada usuario debe tener un nombre válido y una contraseña no vacía.");
    }
    if (Object.prototype.hasOwnProperty.call(users, username)) {
      throw new Error("El usuario «" + username + "» ya existe; no se modificó ningún usuario.");
    }
  });

  usernames.forEach((username) => {
    const salt = Utilities.getUuid();
    users[username] = {
      salt: salt,
      hash: hashPassword_(username, usersToAdd[username], salt, pepper)
    };
  });

  properties.setProperty(COMMENTS_USERS_PROPERTY, JSON.stringify(users));
  properties.deleteProperty(NEW_USERS_PROPERTY);
  Logger.log("Usuarios nuevos añadidos: " + usernames.join(", "));
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
    const body = callback + "(" + JSON.stringify({
      apiVersion: 4,
      comments: comments
    }) + ");";
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

  if (parameters.action === "unlock") {
    return unlockPrivateComment_(parameters, requestId);
  }
  if (parameters.action === "reply") {
    return addCommentReply_(parameters, requestId);
  }
  if (parameters.action === "login") {
    return login_(parameters, requestId);
  }
  if (parameters.action === "edit" || parameters.action === "delete") {
    return manageComment_(parameters, requestId);
  }

  const username = String(parameters.username || "").trim();
  const password = String(parameters.password || "");
  const comment = String(parameters.comment || "").trim();
  const recipient = String(parameters.recipient || "").trim();
  const recipientProvided = parameters.recipientProvided === "true";
  let authentication;
  try {
    authentication = verifyUser_(username, password);
  } catch (error) {
    console.error(error);
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 500,
      error: "No se pudo verificar el usuario. Inténtalo más tarde."
    });
  }
  if (!authentication.valid) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 401,
      error: authentication.error
    });
  }
  if (recipientProvided && (!recipient || !userExists_(recipient))) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: INVALID_RECIPIENT_MESSAGE
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
      error: "El comentario admite hasta 280 caracteres."
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
      requestId: requestId,
      private: recipientProvided
    };
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let dailyLimitReached = false;
    try {
      const timezone = Session.getScriptTimeZone();
      const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
      const lastRow = sheet.getLastRow();
      let commentsToday = 0;
      if (lastRow >= 2) {
        commentsToday = sheet.getRange(2, 1, lastRow - 1, 3).getValues()
          .filter((row) => {
            if (!row[0] || String(row[1]) !== username) {
              return false;
            }
            const savedDate = row[0] instanceof Date
              ? Utilities.formatDate(row[0], timezone, "yyyy-MM-dd")
              : String(row[0]).slice(0, 10);
            return savedDate === today;
          }).length;
      }

      if (commentsToday >= MAX_COMMENTS_PER_DAY) {
        dailyLimitReached = true;
      } else {
        sheet.appendRow([
          commentRecord.date,
          commentRecord.name,
          commentRecord.comment,
          commentRecord.requestId,
          recipient,
          commentRecord.private,
          "",
          false,
          "[]"
        ]);
      }
    } finally {
      lock.releaseLock();
    }

    if (dailyLimitReached) {
      return postMessageResponse_({
        requestId: requestId,
        ok: false,
        status: 429,
        error: "Has alcanzado el límite de 10 comentarios por día."
      });
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

function login_(parameters, requestId) {
  const username = String(parameters.username || "").trim();
  const password = String(parameters.password || "");
  try {
    const authentication = verifyUser_(username, password);
    if (!authentication.valid) {
      return postMessageResponse_({
        requestId: requestId,
        ok: false,
        status: 401,
        error: authentication.error
      });
    }
    return postMessageResponse_({
      requestId: requestId,
      ok: true,
      status: 200,
      username: username
    });
  } catch (error) {
    console.error(error);
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 500,
      error: "No se pudo iniciar sesión. Inténtalo más tarde."
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

  return sheet.getRange(2, 1, lastRow - 1, 9).getValues()
    .filter((row) => row[0] && row[1] && (row[2] || row[7] === true))
    .reverse()
    .map((row) => {
      const comment = {
        date: row[0] instanceof Date ? row[0].toISOString() : String(row[0]),
        name: String(row[1]),
        requestId: String(row[3] || ""),
        private: row[5] === true,
        recipient: row[5] === true ? String(row[4] || "") : "",
        edited: Boolean(row[6]),
        editedAt: row[6] instanceof Date ? row[6].toISOString() : String(row[6] || ""),
        deleted: row[7] === true
      };
      if (!comment.private && !comment.deleted) {
        comment.comment = String(row[2]);
        comment.replies = parseCommentReplies_(row[8]);
      }
      return comment;
    });
}

function verifyUser_(username, password) {
  const properties = PropertiesService.getScriptProperties();
  const usersJson = properties.getProperty(COMMENTS_USERS_PROPERTY);
  const pepper = properties.getProperty(COMMENTS_PEPPER_PROPERTY);
  if (!usersJson || !pepper) {
    throw new Error("No hay usuarios configurados. Ejecuta setup().");
  }

  const users = JSON.parse(usersJson);
  if (!username || username.length > MAX_USERNAME_LENGTH || !password) {
    return {
      valid: false,
      error: 'Introduce el usuario y la contraseña separados por dos puntos (:), por ejemplo "usuario:contraseña".'
    };
  }
  const user = users[username];
  if (!user) {
    return {
      valid: false,
      error: "Usuario no existente. Comprueba el nombre o contacta con Andrés para conseguir una cuenta."
    };
  }
  if (!constantTimeEquals_(
    hashPassword_(username, password, user.salt, pepper),
    user.hash
  )) {
    return {
      valid: false,
      error: "La contraseña es incorrecta."
    };
  }
  return { valid: true, error: "" };
}

function manageComment_(parameters, requestId) {
  const username = String(parameters.username || "").trim();
  const password = String(parameters.password || "");
  const commentId = String(parameters.commentId || "");
  const action = String(parameters.action || "");
  const operation = String(parameters.operation || "");
  if (
    parameters.credentialsProvided !== "true" ||
    !commentId ||
    !/^[\w-]{1,100}$/.test(commentId) ||
    (action === "edit" && !["load", "save"].includes(operation))
  ) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: 'Introduce el usuario y la contraseña separados por dos puntos (:), por ejemplo "usuario:contraseña".'
    });
  }

  let authentication;
  try {
    authentication = verifyUser_(username, password);
  } catch (error) {
    console.error(error);
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 500,
      error: "No se pudo verificar el usuario. Inténtalo más tarde."
    });
  }
  if (!authentication.valid) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 401,
      error: authentication.error
    });
  }
  if (username.length + password.length + 1 > MAX_CREDENTIALS_LENGTH) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: "El usuario y la contraseña superan el límite permitido."
    });
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty(COMMENTS_SPREADSHEET_PROPERTY);
    const sheet = spreadsheetId
      ? SpreadsheetApp.openById(spreadsheetId).getSheetByName(COMMENTS_SHEET_NAME)
      : null;
    if (!sheet) {
      throw new Error("No existe la hoja de comentarios.");
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let result;
    let failure;
    try {
      const lastRow = sheet.getLastRow();
      const rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 9).getValues() : [];
      const rowIndex = rows.findIndex((row) => String(row[3] || "") === commentId);
      if (rowIndex < 0) {
        failure = { status: 404, error: "No se encontró el comentario." };
      } else {
        const row = rows[rowIndex];
        if (String(row[1]) !== username) {
          failure = {
            status: 403,
            error: "El usuario y la contraseña no corresponden a este comentario."
          };
        } else if (row[7] === true) {
          failure = { status: 410, error: "Este comentario ya fue eliminado." };
        } else if (action === "edit" && operation === "save") {
          const text = String(parameters.comment || "").trim();
          if (!text) {
            failure = { status: 400, error: "Escribe un comentario antes de guardar los cambios." };
          } else if (text.length > MAX_COMMENT_LENGTH) {
            failure = { status: 400, error: "El comentario admite hasta 280 caracteres." };
          } else {
            sheet.getRange(rowIndex + 2, 3).setValue(text);
            sheet.getRange(rowIndex + 2, 7).setValue(new Date());
            row[2] = text;
            row[6] = new Date();
            result = { comment: commentFromRow_(row) };
          }
        } else if (action === "edit" && operation === "load") {
          result = { comment: String(row[2]) };
        } else if (action === "delete") {
          sheet.getRange(rowIndex + 2, 8).setValue(true);
          row[7] = true;
          result = { comment: commentFromRow_(row) };
        }
      }
    } finally {
      lock.releaseLock();
    }

    if (failure) {
      return postMessageResponse_({
        requestId: requestId,
        ok: false,
        status: failure.status,
        error: failure.error
      });
    }
    return postMessageResponse_({
      requestId: requestId,
      ok: true,
      status: 200,
      comment: result.comment
    });
  } catch (error) {
    console.error(error);
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 500,
      error: action === "edit"
        ? "No se pudo modificar el comentario. Inténtalo más tarde."
        : "No se pudo eliminar el comentario. Inténtalo más tarde."
    });
  }
}

function commentFromRow_(row) {
  const comment = {
    date: row[0] instanceof Date ? row[0].toISOString() : String(row[0]),
    name: String(row[1]),
    requestId: String(row[3] || ""),
    private: row[5] === true,
    recipient: row[5] === true ? String(row[4] || "") : "",
    edited: Boolean(row[6]),
    editedAt: row[6] instanceof Date ? row[6].toISOString() : String(row[6] || ""),
    deleted: row[7] === true
  };
  if (!comment.private && !comment.deleted) {
    comment.comment = String(row[2]);
    comment.replies = parseCommentReplies_(row[8]);
  }
  return comment;
}

function parseCommentReplies_(value) {
  if (!value) {
    return [];
  }
  const replies = JSON.parse(String(value));
  if (
    !Array.isArray(replies) ||
    replies.some((reply) =>
      !reply ||
      typeof reply !== "object" ||
      Array.isArray(reply) ||
      typeof reply.id !== "string" ||
      typeof reply.username !== "string" ||
      typeof reply.text !== "string" ||
      !Number.isInteger(reply.icon) ||
      reply.icon < 1 ||
      reply.icon > 5 ||
      !Number.isInteger(reply.angle) ||
      reply.angle < -30 ||
      reply.angle > 30
    )
  ) {
    throw new Error("El formato de las respuestas guardadas no es válido.");
  }
  return replies;
}

function addCommentReply_(parameters, requestId) {
  const username = String(parameters.username || "").trim();
  const password = String(parameters.password || "");
  const commentId = String(parameters.commentId || "");
  const replyId = String(parameters.replyId || "");
  const text = String(parameters.reply || "").trim();
  if (
    !commentId ||
    !/^[\w-]{1,100}$/.test(commentId) ||
    !/^[\w-]{1,100}$/.test(replyId)
  ) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: "Solicitud no válida."
    });
  }
  if (!text) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: "Escribe una respuesta."
    });
  }
  if (text.length > 50) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: "La respuesta admite hasta 50 caracteres."
    });
  }
  if (username.length + password.length + 1 > MAX_CREDENTIALS_LENGTH) {
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 400,
      error: "El usuario y la contraseña superan el límite permitido."
    });
  }

  try {
    const authentication = verifyUser_(username, password);
    if (!authentication.valid) {
      return postMessageResponse_({
        requestId: requestId,
        ok: false,
        status: 401,
        error: authentication.error
      });
    }
    const spreadsheetId = PropertiesService.getScriptProperties()
      .getProperty(COMMENTS_SPREADSHEET_PROPERTY);
    const sheet = spreadsheetId
      ? SpreadsheetApp.openById(spreadsheetId).getSheetByName(COMMENTS_SHEET_NAME)
      : null;
    if (!sheet) {
      throw new Error("No existe la hoja de comentarios.");
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let result;
    let failure;
    try {
      const lastRow = sheet.getLastRow();
      const rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 9).getValues() : [];
      const rowIndex = rows.findIndex((row) => String(row[3] || "") === commentId);
      if (rowIndex < 0) {
        failure = { status: 404, error: "No se encontró el comentario." };
      } else {
        const row = rows[rowIndex];
        const replies = parseCommentReplies_(row[8]);
        if (row[7] === true) {
          failure = { status: 410, error: "Este comentario ya fue eliminado." };
        } else if (row[5] === true && username !== String(row[1]) && username !== String(row[4])) {
          failure = {
            status: 403,
            error: "Solo el remitente o destinatario puede responder a este comentario privado."
          };
        } else {
          const existingReply = replies.find((reply) => reply.id === replyId);
          if (existingReply && existingReply.username === username) {
            result = existingReply;
          } else if (existingReply) {
            failure = {
              status: 409,
              error: "El identificador de respuesta ya está en uso."
            };
          } else if (replies.some((reply) => reply.username === username)) {
            failure = {
              status: 409,
              error: "Ya has respondido a este comentario."
            };
          } else if (replies.length >= 5) {
            failure = {
              status: 409,
              error: "Este comentario ya tiene el máximo de 5 respuestas."
            };
          } else {
            result = {
              id: replyId,
              username: username,
              text: text,
              icon: Math.floor(Math.random() * 5) + 1,
              angle: Math.floor(Math.random() * 61) - 30,
              date: new Date().toISOString()
            };
            replies.push(result);
            sheet.getRange(rowIndex + 2, 9).setValue(JSON.stringify(replies));
          }
        }
      }
    } finally {
      lock.releaseLock();
    }

    if (failure) {
      return postMessageResponse_({
        requestId: requestId,
        ok: false,
        status: failure.status,
        error: failure.error
      });
    }
    return postMessageResponse_({
      requestId: requestId,
      ok: true,
      status: 201,
      reply: result
    });
  } catch (error) {
    console.error(error);
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 500,
      error: "No se pudo guardar la respuesta. Inténtalo de nuevo."
    });
  }
}

function userExists_(username) {
  const usersJson = PropertiesService.getScriptProperties()
    .getProperty(COMMENTS_USERS_PROPERTY);
  if (!usersJson) {
    throw new Error("No hay usuarios configurados. Ejecuta setup().");
  }
  return Object.prototype.hasOwnProperty.call(JSON.parse(usersJson), username);
}

function unlockPrivateComment_(parameters, requestId) {
  const username = String(parameters.username || "").trim();
  const password = String(parameters.password || "");
  const commentId = String(parameters.commentId || "");
  try {
    const authentication = verifyUser_(username, password);
    if (!authentication.valid) {
      return postMessageResponse_({
        requestId: requestId,
        ok: false,
        status: 401,
        error: authentication.error
      });
    }
    const spreadsheetId = PropertiesService.getScriptProperties()
      .getProperty(COMMENTS_SPREADSHEET_PROPERTY);
    const sheet = spreadsheetId
      ? SpreadsheetApp.openById(spreadsheetId).getSheetByName(COMMENTS_SHEET_NAME)
      : null;
    if (!sheet) {
      throw new Error("No existe la hoja de comentarios.");
    }
    const lastRow = sheet.getLastRow();
    const rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 9).getValues() : [];
    const record = rows.find((row) =>
      String(row[3] || "") === commentId && row[5] === true && row[7] !== true
    );
    if (!record) {
      return postMessageResponse_({
        requestId: requestId,
        ok: false,
        status: 404,
        error: "No se encontró el comentario privado."
      });
    }
    if (username !== String(record[1]) && username !== String(record[4])) {
      return postMessageResponse_({
        requestId: requestId,
        ok: false,
        status: 403,
        error: "No tienes permiso para mostrar este comentario."
      });
    }
    return postMessageResponse_({
      requestId: requestId,
      ok: true,
      status: 200,
      comment: String(record[2]),
      replies: parseCommentReplies_(record[8])
    });
  } catch (error) {
    console.error(error);
    return postMessageResponse_({
      requestId: requestId,
      ok: false,
      status: 500,
      error: "No se pudo mostrar el comentario privado."
    });
  }
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
