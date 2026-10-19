# Cómo usar los comentarios

La caja de comentarios está debajo de la rejilla de colores. Para publicar necesitas una cuenta autorizada.

## Publicar un comentario normal

1. Inicia sesión con **Usuario:contraseña**. Escribe tu usuario y contraseña separados por dos puntos y pulsa **Iniciar sesión**.
2. Usa el botón **Mostrar** si quieres comprobar lo que has escrito; vuelve a pulsarlo para ocultar la contraseña.
3. Escribe el mensaje en **Comentario**. El contador indica cuántos caracteres llevas: se permiten hasta **280**.
4. Pulsa **Publicar comentario**. Si se publica correctamente, aparecerá en la lista.

Cada cuenta puede publicar como máximo **10 comentarios al día**.

Después de iniciar sesión, la sesión se guarda en el almacenamiento local del navegador para que siga activa al recargar. Esto guarda las credenciales en ese navegador; cierra sesión borrando los datos del sitio si compartes el dispositivo. La sesión se utiliza para publicar, responder, editar y eliminar, y para mostrar solo los comentarios privados dirigidos a esa cuenta o enviados por ella.

También puedes pulsar **Iniciar sesión** junto al botón **Mostrar** para validar la cuenta sin publicar un comentario. Si todavía no tienes cuenta, usa el enlace a Instagram que aparece bajo el campo.

## Enviar un comentario privado

Para que solo otra cuenta concreta y tú podáis leer el comentario, inicia sesión y escribe el usuario de destino en **Destinatario (opcional, para un comentario privado)**:

```text
destinatario
```

El destinatario debe ser una cuenta existente. Después escribe el comentario y publícalo como siempre. Si el destinatario no existe, aparecerá el mensaje **«destinatario no existente»**.

El comentario solo aparecerá en la lista cuando la persona haya iniciado sesión como remitente o destinatario. El texto privado no se envía a otras cuentas.

## Editar o eliminar un comentario

Pulsa el icono de tres puntos del comentario y elige **Editar** o **Eliminar**. Debes iniciar sesión primero y solo puedes modificar tus propios comentarios; en los comentarios de otras personas solo aparece **Responder**. Al editar, el texto actualizado conserva la fecha original y muestra cuándo se editó por última vez. Los comentarios eliminados se sustituyen por *comentario borrado por 'usuario'* en su posición.

Si el comentario es privado, solo el autor puede editarlo; seguirá sin aparecer a otras cuentas después de guardarlo.

## Responder a un comentario

Pulsa los tres puntos y elige **Responder** en tus comentarios, o **Responder** directamente en comentarios de otras personas. Debes iniciar sesión primero. Cada usuario puede dejar **una respuesta por comentario**; cada comentario admite hasta **5 respuestas** en total y cada respuesta hasta **50 caracteres**. El contador muestra los caracteres escritos. No cuentan para el límite diario de comentarios. Se muestran como un icono en la parte superior derecha; al pasar el cursor o pulsarlo aparece el texto y el autor. Si `icons/` contiene un SVG con el mismo nombre que el usuario, se usa como icono y avatar; si no, se muestra un insecto. Las respuestas a comentarios públicos son visibles para todos; las respuestas a comentarios privados solo pueden publicarlas y leerlas el remitente o el destinatario.

Los puntos de cada cuenta parten de **25**. El saldo se calcula como `25 + r - c + 5l - 2d`: `r` cuenta las respuestas de otras personas a sus comentarios públicos no eliminados; `c` resta 1 punto por cada comentario público activo (1,5 si está editado); `l` es el número neto de likes recibidos en publicaciones asociadas a esa cuenta y `d` el número neto de dislikes. Cada cuenta puede emitir un voto por publicación y cambiarlo; repetir el mismo voto no vuelve a sumar puntos. Los votos a publicaciones anónimas se cuentan, pero no cambian el saldo de nadie. Publicar un comentario público cuesta 1 punto; editarlo por primera vez resta 0,5, y borrarlo recupera su coste menos los puntos de las respuestas recibidas. Las acciones privadas no afectan al saldo. No se puede publicar si el saldo es inferior a 1; al borrar comentarios se recuperan puntos. El menú indica el cambio de puntos previsto para editar o borrar y el formulario indica el coste de publicar. Al pasar el cursor por uno de los comentarios se muestra la puntuación sin desplazar el texto.

En la página principal se muestran solo los comentarios de hoy. Pulsa **Ver comentarios más antiguos**, debajo de la lista, para abrir el historial.

## Mensajes de error habituales

- **Introduce el usuario y la contraseña separados por dos puntos**: escribe ambos en el campo, separados por `:`.
- **Usuario no existente** o **La contraseña es incorrecta**: revisa las credenciales.
- **El usuario y la contraseña no corresponden a este comentario**: solo el autor puede editarlo o eliminarlo; verifica que uses la cuenta con la que lo publicaste.
- **La respuesta admite hasta 50 caracteres** o **Este comentario ya tiene el máximo de 5 respuestas**: acorta la respuesta o elige otro comentario.
- **Ya has respondido a este comentario**: cada usuario solo puede responder una vez a cada comentario.
- **Solo el remitente o destinatario puede responder a este comentario privado**: inicia sesión con una de las dos cuentas.
- **No se pudo modificar/eliminar el comentario**: revisa la conexión e inténtalo de nuevo.
- **destinatario no existente**: comprueba el nombre de la cuenta destinataria.
- **Has alcanzado el límite de 10 comentarios por día**: espera al siguiente día para volver a comentar.
- **El comentario admite hasta 280 caracteres**: acorta el texto hasta el máximo indicado por el contador.
- **El comentario admite como máximo 3 saltos de línea**: reduce los saltos de línea a tres o menos.
- **No tienes puntos suficientes para comentar**: borra uno de tus comentarios para recuperar los puntos correspondientes.

Si no tienes una cuenta, contacta con la persona que administra la página para solicitar acceso.

## Publicaciones del grid

Cada color tiene su carpeta con el texto y su propio `index.html` de historial: `magenta/`, `amarillo/`, `cian/` y `negro/`. Los archivos `texto-<color>.txt` aceptan publicaciones con este formato:

```text
AAAA-MM-DD HH:mm|@usuario|texto|ruta-de-imagen|enlace-de-la-imagen
```

La fecha y la hora van al principio de cada post. `@usuario|` es un campo opcional inmediatamente después de la fecha; si se omite, la publicación aparece como «anónimo». La hora usa el formato de 24 horas y la zona horaria local de la persona que visita la página. Así puedes añadir varias publicaciones en un mismo día; en el grid se muestra la más reciente cuya fecha y hora ya hayan llegado. Los historiales muestran todas las publicaciones anteriores ordenadas de más reciente a más antigua. La fecha visible en publicaciones y comentarios muestra «hace unos minutos» durante la primera hora, solo la hora durante el primer día y la fecha y hora después. La imagen, el enlace y la hora son opcionales. Si omites la hora se considera `00:00`, por compatibilidad con entradas que solo contienen la fecha.

Las publicaciones muestran botones de «Me gusta» y «No me gusta». Para votar hay que iniciar sesión. Cada cuenta puede tener un voto por publicación y cambiarlo posteriormente; repetir el mismo voto no suma puntos de nuevo. Un like añade 5 puntos a la cuenta asociada a la publicación y un dislike resta 2. Si una publicación es anónima, los votos se cuentan, pero no cambian puntos. El total de votos es visible para todos.

El texto puede ocupar varias líneas y admite formato sencillo: escribe `\n` para insertar un salto de línea o pon una parte entre guiones bajos para mostrarla en **negrita**. Se pueden combinar ambas cosas. Si añades imagen y enlace, sepáralos del texto con `|`; pon esos campos al final, cada uno separado con `|`.

Ejemplo:

```text
2026-10-18 09:30|Primer mensaje del día||
2026-10-18 17:45|
_Segundo mensaje del día_
Este texto aparece en una línea nueva.
|ice.png|https://ejemplo.com/
```
