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