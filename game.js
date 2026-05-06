let scene, camera, renderer;
let player = { x:0, z:0 };
let velocity = { x:0, z:0 };
let walls = [];
let monster, key, exit;
let hasKey = false;

let footSound = document.getElementById("foot");
let monsterSound = document.getElementById("monster");

function startGame(){
  document.getElementById("menu").style.display="none";
  init();
}

function init(){
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.y = 2;

  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  createMap();
  createMonster();
  createKeyAndExit();

  animate();
}

function createMap(){
  let floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200,200),
    new THREE.MeshBasicMaterial({color:0xffffcc})
  );
  floor.rotation.x = -Math.PI/2;
  scene.add(floor);

  // Labirint
  for(let i=0;i<80;i++){
    let wall = new THREE.Mesh(
      new THREE.BoxGeometry(3,3,1),
      new THREE.MeshBasicMaterial({color:0xcccc99})
    );
    wall.position.set(Math.random()*100-50,1.5,Math.random()*100-50);
    scene.add(wall);
    walls.push(wall);
  }
}

function createMonster(){
  monster = new THREE.Mesh(
    new THREE.BoxGeometry(2,3,2),
    new THREE.MeshBasicMaterial({color:0xff0000})
  );
  monster.position.set(30,1.5,30);
  scene.add(monster);
}

function createKeyAndExit(){
  key = new THREE.Mesh(
    new THREE.BoxGeometry(1,1,1),
    new THREE.MeshBasicMaterial({color:0x00ff00})
  );
  key.position.set(-20,0.5,-20);
  scene.add(key);

  exit = new THREE.Mesh(
    new THREE.BoxGeometry(3,3,1),
    new THREE.MeshBasicMaterial({color:0x0000ff})
  );
  exit.position.set(40,1.5,-40);
  scene.add(exit);
}

let keys = {};
document.addEventListener("keydown", e => keys[e.key]=true);
document.addEventListener("keyup", e => keys[e.key]=false);

function movePlayer(){
  let speed = 0.15;
  velocity.x = 0;
  velocity.z = 0;

  if(keys["w"]) velocity.z -= speed;
  if(keys["s"]) velocity.z += speed;
  if(keys["a"]) velocity.x -= speed;
  if(keys["d"]) velocity.x += speed;

  let nextX = player.x + velocity.x;
  let nextZ = player.z + velocity.z;

  // collision
  let blocked = walls.some(w=>{
    return Math.abs(w.position.x - nextX) < 2 &&
           Math.abs(w.position.z - nextZ) < 2;
  });

  if(!blocked){
    player.x = nextX;
    player.z = nextZ;

    if(!footSound.paused) return;
    footSound.play();
  } else {
    footSound.pause();
  }
}

function moveMonster(){
  let dx = player.x - monster.position.x;
  let dz = player.z - monster.position.z;

  let dist = Math.sqrt(dx*dx + dz*dz);

  monster.position.x += dx * 0.01;
  monster.position.z += dz * 0.01;

  // sound distance
  monsterSound.volume = Math.max(0, 1 - dist/30);

  if(monsterSound.paused) monsterSound.play();

  if(dist < 2){
    alert("Tutuldun!");
    location.reload();
  }
}

function checkGame(){
  let distKey = Math.hypot(player.x-key.position.x, player.z-key.position.z);
  if(distKey < 2){
    hasKey = true;
    scene.remove(key);
  }

  let distExit = Math.hypot(player.x-exit.position.x, player.z-exit.position.z);
  if(distExit < 3 && hasKey){
    alert("Qazandın!");
    location.reload();
  }
}

function animate(){
  requestAnimationFrame(animate);

  movePlayer();
  moveMonster();
  checkGame();

  camera.position.x = player.x;
  camera.position.z = player.z + 5;
  camera.lookAt(player.x,0,player.z);

  renderer.render(scene, camera);
}
