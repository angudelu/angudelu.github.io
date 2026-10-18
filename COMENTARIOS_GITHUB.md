# Activar los comentarios en GitHub Pages

GitHub Pages sirve archivos estáticos y no ejecuta `server.py`. Para habilitar los comentarios, esta página puede conectarse a Google Apps Script y guardar los mensajes en una hoja de cálculo privada.

## 1. Crear el proyecto de Apps Script

1. Abre [script.google.com](https://script.google.com/) y crea un proyecto.
2. Copia el contenido de `apps-script/Code.gs` de este repositorio en el archivo `Code.gs` del proyecto.
3. En **Configuración del proyecto > Propiedades del script**, añade:
   - `INITIAL_USERS_JSON`: un objeto JSON con los usuarios autorizados, por ejemplo `{"tu_usuario":"tu_contraseña"}`. No pongas esta propiedad en GitHub ni la compartas.
   - `ALLOWED_ORIGIN`: el origen de GitHub Pages, sin ruta. Para un sitio de proyecto suele ser `https://tu-usuario.github.io`.
4. Selecciona la función `setup` y pulsa **Ejecutar**. Autoriza la creación de la hoja. `setup` crea la hoja privada y convierte las contraseñas en hashes con sal y una clave privada; al terminar elimina `INITIAL_USERS_JSON`. No compartas el proyecto de Apps Script con editores que no deban administrar cuentas.
5. En Apps Script, pulsa **Implementar > Nueva implementación > Aplicación web**. Selecciona **Ejecutar como: yo** y permite el acceso necesario para que los visitantes puedan enviar comentarios. Implementa y copia la URL que termina en `/exec`.

Los comentarios se guardan en la hoja creada por `setup`; la hoja no necesita hacerse pública. Los hashes y la clave se quedan en las propiedades privadas del proyecto Apps Script.

## Añadir usuarios autorizados

1. En Apps Script abre **Configuración del proyecto > Propiedades del script** y añade `NEW_USERS_JSON`. Su valor debe ser un objeto JSON con los nombres y contraseñas nuevas, por ejemplo:

   ```json
   {"nuevo_usuario":"una contraseña larga"}
   ```

   Puedes incluir varios usuarios en el mismo objeto. No edites ni reemplaces `COMMENTS_USERS` o `COMMENTS_PEPPER`.
2. En el editor selecciona `addUsers` y pulsa **Ejecutar**. Si todo va bien, Apps Script convierte las contraseñas en hashes con sal, las añade a la lista existente y borra `NEW_USERS_JSON`.
3. Comprueba el registro de ejecución. No hace falta volver a implementar el sitio web; las cuentas nuevas se pueden usar enseguida.

Si el nombre ya existe, `addUsers` cancela la operación completa y conserva `NEW_USERS_JSON` para que puedas corregirlo. Los nombres de usuario no pueden contener `:`; las contraseñas pueden contenerlo.

El servidor limita cada cuenta a **5 comentarios por día**, según la zona horaria configurada en el proyecto de Apps Script, y rechaza los comentarios que superen **280 caracteres**. Estos límites se comprueban en el servidor, no solo en el formulario. Tras modificar `apps-script/Code.gs`, publica una nueva versión de la aplicación web de Apps Script para aplicar también allí los límites.

Para publicar un comentario privado, escribe `remitente:contraseña@destinatario` en la caja de usuario y contraseña. El destinatario debe ser una cuenta existente. El comentario se muestra oculto; para desbloquearlo, el remitente o el destinatario debe introducir `usuario:contraseña` en la caja del comentario. El texto privado no se incluye en la lista pública de comentarios.

## 2. Conectar GitHub Pages

En `comments-config.js`, sustituye la cadena vacía por la URL `/exec` copiada:

```js
window.COMMENTS_API_URL = "https://script.google.com/macros/s/ID_DE_IMPLEMENTACION/exec";
```

Guarda y publica el cambio en GitHub. Después abre la URL de GitHub Pages y prueba a enviar un comentario con `usuario:contraseña`.

Si más adelante editas `Code.gs`, crea una versión nueva de la implementación web para que los cambios entren en vigor. Después de actualizarlo, ejecuta `setup()` una vez para asegurar las columnas de destinatario, privacidad, edición y borrado lógico en la hoja existente; conserva las publicaciones guardadas. La respuesta vuelve al nivel superior de la página (`window.top`) usando el `ALLOWED_ORIGIN` exacto; si el navegador no entrega esa respuesta al formulario, la página consulta repetidamente la lista y espera a que aparezca el comentario nuevo. El envío no depende del evento de carga del iframe. Tras cambiar `app.js`, publica también el HTML actualizado para que GitHub Pages sirva el parámetro de versión nuevo y no reutilice una copia antigua en caché.

La versión actual de `apps-script/Code.gs` permite al autor editar o eliminar sus comentarios con sus credenciales. La eliminación es lógica: la fila se conserva y se muestra «comentario eliminado». Al publicar cambios del cliente y del backend, actualiza GitHub Pages y crea una nueva versión de la implementación web de Apps Script.
