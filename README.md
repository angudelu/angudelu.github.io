# Cómo usar los comentarios

La caja de comentarios está debajo de la rejilla de colores. Para publicar necesitas una cuenta autorizada.

## Publicar un comentario normal

1. En **Usuario:contraseña**, escribe tu usuario y contraseña juntos, separados por dos puntos. Por ejemplo: `usuario:contraseña`.
2. Usa el botón **Mostrar** si quieres comprobar lo que has escrito; vuelve a pulsarlo para ocultar la contraseña.
3. Escribe el mensaje en **Comentario**. El contador indica cuántos caracteres llevas: se permiten hasta **280**.
4. Pulsa **Publicar comentario**. Si se publica correctamente, aparecerá en la lista.

Cada cuenta puede publicar como máximo **5 comentarios al día**.

## Enviar un comentario privado

Para que solo otra cuenta concreta y tú podáis leer el comentario, escribe en el campo de usuario:

```text
remitente:contraseña@destinatario
```

Sustituye `remitente` y `contraseña` por tus credenciales y `destinatario` por el nombre de una cuenta existente. Después escribe el comentario y publícalo como siempre. Si el destinatario no existe, aparecerá el mensaje **«destinatario no existente»**.

El comentario aparecerá oculto, con el encabezado `remitente@destinatario`, para que se identifique quién lo envió y a quién va dirigido. Para verlo, el remitente o el destinatario debe escribir sus propias credenciales con el formato `usuario:contraseña` en la caja negra del comentario y pulsar **Mostrar comentario**. Otras cuentas no pueden desbloquearlo.

## Editar o eliminar un comentario

Pulsa el icono de tres puntos del comentario y elige **Editar** o **Eliminar**. Ambas acciones requieren las credenciales del autor (`usuario:contraseña`); usa **Mostrar/Ocultar** para comprobar lo que has escrito. No se permite modificar comentarios de otra cuenta. Al editar, el texto actualizado conserva la fecha original y aparece marcado como **(editado)**. Los comentarios eliminados se sustituyen por el texto *comentario eliminado* en su posición.

Si el comentario es privado, primero carga su texto desde el formulario de edición con las credenciales del autor. El comentario seguirá oculto para los demás después de guardarlo.

## Mensajes de error habituales

- **Introduce el usuario y la contraseña separados por dos puntos**: escribe ambos en el campo, separados por `:`.
- **Usuario no existente** o **La contraseña es incorrecta**: revisa las credenciales.
- **El usuario y la contraseña no corresponden a este comentario**: solo el autor puede editarlo o eliminarlo; verifica que uses la cuenta con la que lo publicaste.
- **No se pudo modificar/eliminar el comentario**: revisa la conexión e inténtalo de nuevo.
- **destinatario no existente**: comprueba el nombre de la cuenta destinataria.
- **Has alcanzado el límite de 5 comentarios por día**: espera al siguiente día para volver a comentar.
- **El comentario admite hasta 280 caracteres**: acorta el texto hasta el máximo indicado por el contador.

Si no tienes una cuenta, contacta con la persona que administra la página para solicitar acceso.

## Publicaciones del grid

Los archivos `texto-magenta.txt`, `texto-amarillo.txt`, `texto-cian.txt` y `texto-negro.txt` aceptan publicaciones con este formato:

```text
AAAA-MM-DD HH:mm|texto|ruta-de-imagen|enlace-de-la-imagen
```

La fecha y la hora van al principio de cada post. La hora usa el formato de 24 horas y la zona horaria local de la persona que visita la página. Así puedes añadir varias publicaciones en un mismo día; en el grid se muestra la más reciente cuya fecha y hora ya hayan llegado. Los historiales muestran todas las publicaciones anteriores ordenadas de más reciente a más antigua. La imagen, el enlace y la hora son opcionales. Si omites la hora se considera `00:00`, por compatibilidad con entradas que solo contienen la fecha.

El texto puede ocupar varias líneas y admite formato sencillo: escribe `\n` para insertar un salto de línea o pon una parte entre guiones bajos para mostrarla en **negrita**. Se pueden combinar ambas cosas. Si añades imagen y enlace, sepáralos del texto con `|`; pon esos campos al final, cada uno separado con `|`.

Ejemplo:

```text
2026-10-18 09:30|Primer mensaje del día||
2026-10-18 17:45|
_Segundo mensaje del día_
Este texto aparece en una línea nueva.
|ice.png|https://ejemplo.com/
```
