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

## 2. Conectar GitHub Pages

En `comments-config.js`, sustituye la cadena vacía por la URL `/exec` copiada:

```js
window.COMMENTS_API_URL = "https://script.google.com/macros/s/ID_DE_IMPLEMENTACION/exec";
```

Guarda y publica el cambio en GitHub. Después abre la URL de GitHub Pages y prueba a enviar un comentario con `usuario:contraseña`.

Si más adelante editas `Code.gs`, crea una versión nueva de la implementación web para que los cambios entren en vigor. Si mueves GitHub Pages a otro origen, actualiza `ALLOWED_ORIGIN` en las propiedades del script y vuelve a implementar.
