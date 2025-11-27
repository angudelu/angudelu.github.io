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
    document.getElementById('botonmusica').textContent = 'quitar sonido?';
  }
  else{
    audiom.muted = true;
    document.getElementById('botonmusica').textContent = 'activar sonido?';
  }

  console.log('botonmusica pulsado... audio muteado?:', audiom.muted);
}

function engordar(){
    document.getElementById('mmm').src = "mmm_gordo.png";
}