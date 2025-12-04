var audiom = new Audio('blarf.mp3');
audiom.loop = true;
audiom.muted = true;
audiom.load();

function musica(){
  if(!audiom.playing){
    audiom.play();
  }
  if(audiom.muted){
    audiom.muted = false;
    audiom.volume = 1;
    document.getElementById('sound_but').textContent = 'quitar sonido?';
  }
  else{
    audiom.muted = true;
    document.getElementById('sound_but').textContent = 'activar sonido?';
  }

  console.log('sound_but pressed... is audio muted?:', audiom.muted);
}

function engordar(){
    document.getElementById('mmm').src = "fat_mmm.png";
}

function carrega(){
  document.getElementById("blog").remove();
  document.getElementById("lineadivisoria").remove();
  document.getElementById("publi").style.width = "100%";
  document.getElementById("header").style.flexDirection = "column";
  document.getElementById("nav").style.width = "100%";
  document.getElementById("up_title").style.width = "100%";
  document.getElementById("up_title").replaceChildren("hola biembenido a mi césped, éste aquí el título en móvil está bien feo ya lo arreglaré o algo jaja. mejor que useis la página en ordenador tbh pq el javascript está bien complicadoooo");
  document.getElementById("audiostuff").remove();
}