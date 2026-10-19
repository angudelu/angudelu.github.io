# Activar los comentarios en GitHub Pages

GitHub Pages sirve archivos estáticos y no ejecuta `server.py`. Para habilitar los comentarios, esta página puede conectarse a Google Apps Script y guardar los mensajes en una hoja de cálculo privada.

## 1. Crear el proyecto de Apps Script

1. Abre [script.google.com](https://script.google.com/) y crea un proyecto.
2. Copia el contenido de `apps-script/Code.gs` de este repositorio en el archivo `Code.gs` del proyecto.
3. En **Configuración del proyecto > Propiedades del script**, añade:
   - `INITIAL_USERS_JSON`: un objeto JSON con los usuarios autorizados, por ejemplo `{"tu_usuario":"tu_contraseña"}`. No pongas esta propiedad en GitHub ni la compartas.
   - `ALLOWED_ORIGIN`: el origen de GitHub Pages, sin ruta. Para un sitio de proyecto suele ser `https://tu-usuario.github.io`.
4. Selecciona la función `setup` y pulsa **Ejecutar**. Autoriza la creación de las hojas. `setup` crea las hojas privadas de comentarios y votos de publicaciones, convierte las contraseñas en hashes con sal y una clave privada; al terminar elimina `INITIAL_USERS_JSON`. No compartas el proyecto de Apps Script con editores que no deban administrar cuentas.
5. En Apps Script, pulsa **Implementar > Nueva implementación > Aplicación web**. Selecciona **Ejecutar como: yo** y permite el acceso necesario para que los visitantes puedan enviar comentarios. Implementa y copia la URL que termina en `/exec`.

Los comentarios y votos se guardan en las hojas creadas por `setup`; las hojas no necesitan hacerse públicas. Los hashes y la clave se quedan en las propiedades privadas del proyecto Apps Script.

## Añadir usuarios autorizados

1. En Apps Script abre **Configuración del proyecto > Propiedades del script** y añade `NEW_USERS_JSON`. Su valor debe ser un objeto JSON con los nombres y contraseñas nuevas, por ejemplo:

   ```json
   {"nuevo_usuario":"una contraseña larga"}
   ```

   Puedes incluir varios usuarios en el mismo objeto. No edites ni reemplaces `COMMENTS_USERS` o `COMMENTS_PEPPER`.
2. En el editor selecciona `addUsers` y pulsa **Ejecutar**. Si todo va bien, Apps Script convierte las contraseñas en hashes con sal, las añade a la lista existente y borra `NEW_USERS_JSON`.
3. Comprueba el registro de ejecución. No hace falta volver a implementar el sitio web; las cuentas nuevas se pueden usar enseguida.

Si el nombre ya existe, `addUsers` cancela la operación completa y conserva `NEW_USERS_JSON` para que puedas corregirlo. Los nombres de usuario no pueden contener `:`; las contraseñas pueden contenerlo.

El servidor limita cada cuenta a **5 comentarios por día**, según la zona horaria configurada en el proyecto de Apps Script, y rechaza los comentarios que superen **280 caracteres** o **3 saltos de línea**. Estos límites se comprueban en el servidor, no solo en el formulario. Tras modificar `apps-script/Code.gs`, publica una nueva versión de la aplicación web de Apps Script para aplicar también allí los límites.

Para publicar un comentario privado, inicia sesión y escribe el nombre de la cuenta destinataria en el campo opcional **destinatario** del formulario. El destinatario debe ser una cuenta existente. El comentario solo se incluye en la lista que se entrega al remitente o al destinatario después de iniciar sesión; no se envían ni siquiera sus metadatos a otras cuentas.

## 2. Conectar GitHub Pages

En `comments-config.js`, sustituye la cadena vacía por la URL `/exec` copiada:

```js
window.COMMENTS_API_URL = "https://script.google.com/macros/s/ID_DE_IMPLEMENTACION/exec";
```

Guarda y publica el cambio en GitHub. Después abre la URL de GitHub Pages y prueba a enviar un comentario con `usuario:contraseña`.

Si más adelante editas `Code.gs`, crea una versión nueva de la implementación web para que los cambios entren en vigor. Después de actualizarlo, ejecuta `setup()` una vez para asegurar las columnas de destinatario, privacidad, edición, borrado lógico y respuestas en la hoja existente; conserva las publicaciones guardadas. La respuesta vuelve al nivel superior de la página (`window.top`) usando el `ALLOWED_ORIGIN` exacto; si el navegador no entrega esa respuesta al formulario, la página consulta repetidamente la lista y espera a que aparezca el comentario nuevo. El envío no depende del evento de carga del iframe. Tras cambiar `app.js`, publica también el HTML actualizado para que GitHub Pages sirva el parámetro de versión nuevo y no reutilice una copia antigua en caché.

La versión actual de `apps-script/Code.gs` permite al autor editar o eliminar sus comentarios durante una sesión iniciada. La eliminación es lógica: la fila se conserva y se muestra «comentario borrado por 'usuario'». Al publicar cambios del cliente y del backend, actualiza GitHub Pages y crea una nueva versión de la implementación web de Apps Script. La página comprueba la versión de la API antes de enviar operaciones de edición o borrado; si aparece un aviso de que estas opciones no están habilitadas, crea una versión nueva de la aplicación web y actualiza el despliegue para que use esa versión.

El botón **Iniciar sesión** valida la cuenta sin publicar ningún comentario. Las respuestas se guardan en la misma fila del comentario, no consumen el límite diario y cada usuario puede dejar una respuesta de hasta 50 caracteres; cada comentario admite hasta 5 respuestas en total. Las respuestas a comentarios públicos se incluyen en la lista pública y son visibles para cualquiera; las privadas solo se devuelven al remitente o destinatario autenticado. La lista autenticada también devuelve los textos privados y no muestra comentarios privados a otras cuentas. Cada usuario empieza con 25 puntos; el saldo persistido en `COMMENTS_USERS` incluye las respuestas ajenas a comentarios públicos, el coste de comentarios públicos activos (1,5 si están editados) y los likes/dislikes de las publicaciones asociadas a esa cuenta: `25 + respuestas - coste_comentarios + 5 × likes - 2 × dislikes`. Los comentarios privados no alteran los puntos. No se puede publicar con menos de 1 punto; borrar comentarios devuelve su coste, descontando los puntos de las respuestas recibidas. El formulario y las opciones de editar/borrar muestran el cambio de saldo previsto. Para habilitar el inicio de sesión, la persistencia de sesión, el historial privado, los puntos y los votos en GitHub Pages, publica la versión actualizada de `apps-script/Code.gs`: la página requiere que el endpoint devuelva `apiVersion: 8`.

Las sesiones se conservan en el almacenamiento local del navegador para sobrevivir a una recarga; por ello, el navegador guarda las credenciales y no se debe mantener la sesión en un dispositivo compartido. La página principal muestra los comentarios del día y `comentarios-antiguos.html` carga los de días anteriores.

## Publicaciones de colores, autores y votos

Cada color tiene su propia carpeta (`magenta/`, `amarillo/`, `cian/` y `negro/`). Dentro están `texto-<color>.txt` y el `index.html` del historial. Las páginas y el grid usan estas rutas; no vuelvas a colocar esos archivos en la raíz.

Cada publicación puede asociarse a una cuenta añadiendo `@usuario|` inmediatamente después de la fecha:

```text
AAAA-MM-DD HH:mm|@usuario|texto|ruta-de-imagen|enlace-de-la-imagen
```

El campo de cuenta es opcional. Si se omite, se muestra «anónimo». Las cuentas asociadas deben existir en Apps Script; junto al nombre se muestra `icons/<usuario>.svg` cuando está disponible.

Los likes y dislikes requieren inicio de sesión y son visibles en el grid y el historial. Cada cuenta puede votar una vez por publicación y cambiar su elección, sin acumular puntos al repetir la misma acción. Un like suma 5 puntos a la cuenta asociada y un dislike resta 2. Los votos de publicaciones anónimas se cuentan, pero no cambian puntos. El servidor valida el autor directamente contra el archivo del post, no contra el nombre enviado por el navegador.

Al actualizar `apps-script/Code.gs`, ejecuta `setup()` de nuevo para crear la hoja de votos en la hoja de cálculo existente y publica una nueva versión de la aplicación web. La web necesita que la API devuelva `apiVersion: 8` para guardar votos; las rutas del servidor local persisten los votos en `post-votes.json`, que no debe publicarse ni compartirse.
