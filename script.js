import * as THREE from 'three';

// --- Maze Generation ---
const MAZE_SIZE = 25; const TILE_SIZE = 12; 
const maze = Array(MAZE_SIZE).fill(null).map(() => Array(MAZE_SIZE).fill(1));
const emptyCells = [];

function carveMaze(x, y) {
    maze[x][y] = 0;
    const dirs = [[0,-1], [0,1], [-1,0], [1,0]].sort(() => Math.random() - 0.5);
    for (let [dx, dy] of dirs) {
        const nx = x + dx * 2; const ny = y + dy * 2;
        if (nx > 0 && nx < MAZE_SIZE - 1 && ny > 0 && ny < MAZE_SIZE - 1 && maze[nx][ny] === 1) {
            maze[x + dx][y + dy] = 0; carveMaze(nx, ny);
        }
    }
}
carveMaze(1, 1); 

for (let i = 1; i < MAZE_SIZE - 1; i++) {
    for (let j = 1; j < MAZE_SIZE - 1; j++) {
        if (maze[i][j] === 1 && ((maze[i-1][j] === 0 && maze[i+1][j] === 0) || (maze[i][j-1] === 0 && maze[i][j+1] === 0)) && Math.random() < 0.25) maze[i][j] = 0; 
    }
}

const exitGridX = Math.floor(MAZE_SIZE / 2); const exitGridZ = MAZE_SIZE - 1; 
for(let i = -1; i <= 1; i++) { for(let j = -3; j <= -1; j++) { maze[exitGridX + i][exitGridZ + j] = 0; } }
maze[exitGridX][exitGridZ] = 0; 

for(let i=0; i<MAZE_SIZE; i++) { for(let j=0; j<MAZE_SIZE; j++) { if(maze[i][j] === 0) emptyCells.push({x: i, z: j}); } }

// --- Game Logic ---
const totalOrbs = 12; let orbsCollected = 0; let gameActive = false; let gameWon = false;
let startTime = 0; let accumulatedTime = 0; let hasPlayedSting = false; let prevTime = performance.now(); 

document.getElementById('totalOrbsUI').innerText = totalOrbs;

let yaw = Math.PI; let pitch = 0; const SENSITIVITY = 0.002;

// --- STAMINA BUFFS ---
const MAX_STAMINA = 200;
const player = { height: 2.1, radius: 0.8, walkSpeed: 0.22, runSpeed: 0.48, stamina: MAX_STAMINA, isExhausted: false, velocity: new THREE.Vector2(0, 0), headBobTimer: 0 };
const keys = {};

const radarCanvas = document.getElementById('radar'); const rCtx = radarCanvas.getContext('2d');
const rCenter = radarCanvas.width / 2; const radarMaxDist = 120; const radarScale = (rCenter - 10) / radarMaxDist;

// --- Industrial Audio Engine ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let klaxonOsc, klaxonGain, vaultOsc, vaultGain, latchOsc, latchGain, pistonOsc, pistonGain, gearOsc, gearGain, hissSrc, hissGain;

function initIndustrialAudio() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    klaxonOsc = audioCtx.createOscillator(); klaxonOsc.type = 'triangle'; klaxonOsc.frequency.value = 450;
    const klaxonLFO = audioCtx.createOscillator(); klaxonLFO.frequency.value = 2; 
    const klaxonMod = audioCtx.createGain(); klaxonMod.gain.value = 150; 
    klaxonLFO.connect(klaxonMod); klaxonMod.connect(klaxonOsc.frequency); klaxonLFO.start();
    klaxonGain = audioCtx.createGain(); klaxonGain.gain.value = 0;
    klaxonOsc.connect(klaxonGain); klaxonGain.connect(audioCtx.destination); klaxonOsc.start();
    vaultOsc = audioCtx.createOscillator(); vaultOsc.type = 'sawtooth'; vaultOsc.frequency.value = 180;
    vaultGain = audioCtx.createGain(); vaultGain.gain.value = 0;
    vaultOsc.connect(vaultGain); vaultGain.connect(audioCtx.destination); vaultOsc.start();
    latchOsc = audioCtx.createOscillator(); latchOsc.type = 'sawtooth'; latchOsc.frequency.value = 90;
    latchGain = audioCtx.createGain(); latchGain.gain.value = 0;
    latchOsc.connect(latchGain); latchGain.connect(audioCtx.destination); latchOsc.start();
    pistonOsc = audioCtx.createOscillator(); pistonOsc.type = 'square'; pistonOsc.frequency.value = 35;
    pistonGain = audioCtx.createGain(); pistonGain.gain.value = 0;
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 150;
    pistonOsc.connect(filter); filter.connect(pistonGain); pistonGain.connect(audioCtx.destination); pistonOsc.start();
    gearOsc = audioCtx.createOscillator(); gearOsc.type = 'square'; gearOsc.frequency.value = 18; 
    gearGain = audioCtx.createGain(); gearGain.gain.value = 0;
    gearOsc.connect(gearGain); gearGain.connect(audioCtx.destination); gearOsc.start();
    const bufferSize = audioCtx.sampleRate * 2; const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    hissSrc = audioCtx.createBufferSource(); hissSrc.buffer = noiseBuffer; hissSrc.loop = true;
    const hissFilter = audioCtx.createBiquadFilter(); hissFilter.type = 'highpass'; hissFilter.frequency.value = 1000;
    hissGain = audioCtx.createGain(); hissGain.gain.value = 0;
    hissSrc.connect(hissFilter); hissFilter.connect(hissGain); hissGain.connect(audioCtx.destination); hissSrc.start();
}

function playSting() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 1);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 1);
}

// --- Procedural Textures ---
function createGrimeTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const ctx = c.getContext('2d');
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(0,0,512,512);
    for(let i=0; i<10000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(80,60,40,0.1)';
        ctx.beginPath(); ctx.arc(Math.random()*512, Math.random()*512, Math.random()*4, 0, Math.PI*2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2); return tex;
}
function createHazardTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d');
    ctx.fillStyle = '#d4af37'; ctx.fillRect(0,0,256,256); ctx.fillStyle = '#111';
    for(let i=-256; i<512; i+=64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i+32, 0); ctx.lineTo(i+288, 256); ctx.lineTo(i+256, 256); ctx.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
}

// --- Scene & Lighting ---
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c121a); scene.fog = new THREE.Fog(0x0c121a, 15, 120); 
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.rotation.order = 'YXZ';

// High quality shadows
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); scene.add(hemiLight);
const flashLight = new THREE.SpotLight(0xffffe6, 50.0, 500, Math.PI / 5, 0.6, 1.0);
flashLight.position.set(0, 0, 0); flashLight.castShadow = true; flashLight.shadow.bias = -0.001;
camera.add(flashLight); camera.add(flashLight.target); flashLight.target.position.set(0, 0, -1); scene.add(camera);

// --- Materials ---
const matDarkMetal = new THREE.MeshStandardMaterial({ map: createGrimeTexture(), metalness: 0.8, roughness: 0.7 });
const matRustyFrame = new THREE.MeshStandardMaterial({ color: 0x3d352b, metalness: 0.9, roughness: 0.9 });
const matBrightSteel = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1.0, roughness: 0.2 }); 
const matHazard = new THREE.MeshStandardMaterial({ map: createHazardTexture(), metalness: 0.3, roughness: 0.8 });
const matWarningYellow = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.4, roughness: 0.7 });
const matBlackHole = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1.0 });
const matGlassRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000, transparent: true, opacity: 0.8 });
const matIndicator = new THREE.MeshBasicMaterial({ color: 0xff0000 });

// --- Particle Systems ---
const dustGeo = new THREE.BufferGeometry(); const dustCount = 1500;
const dustPos = new Float32Array(dustCount * 3);
for(let i=0; i<dustCount*3; i++) { dustPos[i] = (Math.random() - 0.5) * MAZE_SIZE * TILE_SIZE; }
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({ color: 0x8b6b4a, size: 0.2, transparent: true, opacity: 0.5 });
const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

// --- Level Building & Colliders ---
const colliders = []; const orbs = [];
const floorGeo = new THREE.PlaneGeometry(MAZE_SIZE * TILE_SIZE, MAZE_SIZE * TILE_SIZE);
const floor = new THREE.Mesh(floorGeo, matDarkMetal); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const ceiling = new THREE.Mesh(floorGeo, matRustyFrame); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 12; ceiling.receiveShadow = true; scene.add(ceiling);

const wallGeo = new THREE.BoxGeometry(TILE_SIZE, 12, TILE_SIZE);
const pillarGeo = new THREE.CylinderGeometry(1, 1, 12, 8);

let breachPos = new THREE.Vector3();

for (let i = 0; i < MAZE_SIZE; i++) {
    for (let j = 0; j < MAZE_SIZE; j++) {
        if (maze[i][j] === 1) {
            const isEdge = i === 0 || j === 0 || i === MAZE_SIZE - 1 || j === MAZE_SIZE - 1;
            const wall = new THREE.Mesh(wallGeo, isEdge ? matHazard : matRustyFrame);
            wall.position.set((i - MAZE_SIZE/2) * TILE_SIZE, 6, (j - MAZE_SIZE/2) * TILE_SIZE);
            wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
            colliders.push(new THREE.Box3().setFromObject(wall));
            
            if (!isEdge && Math.random() > 0.8) {
                const pillar = new THREE.Mesh(pillarGeo, matWarningYellow);
                pillar.position.set(wall.position.x + (Math.random()-0.5)*TILE_SIZE, 6, wall.position.z + (Math.random()-0.5)*TILE_SIZE);
                pillar.castShadow = true; pillar.receiveShadow = true; scene.add(pillar);
                colliders.push(new THREE.Box3().setFromObject(pillar));
            }
        }
    }
}

// Spawn Breach (Exit Location)
const breachGroup = new THREE.Group();
breachPos.set((exitGridX - MAZE_SIZE/2) * TILE_SIZE, 6, (exitGridZ - MAZE_SIZE/2) * TILE_SIZE);
const breachHole = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE-2, 10, TILE_SIZE-2), matBlackHole);
breachHole.position.copy(breachPos); breachGroup.add(breachHole);

const breachLight = new THREE.PointLight(0x77ff77, 2, 40); breachLight.position.copy(breachPos); breachGroup.add(breachLight);
scene.add(breachGroup);

// --- Orb Spawning ---
const orbGeo = new THREE.SphereGeometry(0.5, 16, 16);
const orbMat = new THREE.MeshStandardMaterial({ color: 0x00eeff, emissive: 0x0088aa, metalness: 0.1, roughness: 0.2 });

for (let i = 0; i < totalOrbs; i++) {
    const cellIndex = Math.floor(Math.random() * emptyCells.length);
    const cell = emptyCells.splice(cellIndex, 1)[0];
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set((cell.x - MAZE_SIZE/2) * TILE_SIZE, 3, (cell.z - MAZE_SIZE/2) * TILE_SIZE);
    
    const orbLight = new THREE.PointLight(0x00eeff, 1, 15);
    orbLight.position.copy(orb.position);
    scene.add(orb); scene.add(orbLight);
    
    orbs.push({ mesh: orb, light: orbLight, active: true, floatOffset: Math.random() * Math.PI * 2 });
}

// --- The Phantom (Enemy AI) ---
const phantomGeo = new THREE.CylinderGeometry(0.8, 0.2, 3.5, 16);
const phantomMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, transparent: true, opacity: 0.8 });
const phantom = new THREE.Mesh(phantomGeo, phantomMat);
phantom.position.set(0, 3, 0); 
scene.add(phantom);

const phantomLight = new THREE.PointLight(0xff0000, 2, 25);
scene.add(phantomLight);

let phantomActive = false;
let phantomSpeed = 0.08;

// --- Player Controls ---
document.addEventListener('keydown', (e) => { 
    keys[e.code] = true; 
    if (e.code === 'ShiftLeft' && !player.isExhausted) player.run = true;
});
document.addEventListener('keyup', (e) => { 
    keys[e.code] = false; 
    if (e.code === 'ShiftLeft') player.run = false;
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body) {
        yaw -= e.movementX * SENSITIVITY;
        pitch -= e.movementY * SENSITIVITY;
        pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, pitch));
        camera.rotation.set(pitch, yaw, 0);
    }
});

document.getElementById('engage-btn').addEventListener('click', () => {
    document.body.requestPointerLock();
    initIndustrialAudio();
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
        document.getElementById('main-ui').style.display = 'none';
        if (!gameActive && !gameWon) {
            gameActive = true;
            startTime = performance.now() - accumulatedTime;
            prevTime = performance.now();
            phantomActive = true; // Phantom starts hunting immediately
        }
    } else {
        if (gameActive && !gameWon) {
            document.getElementById('main-ui').style.display = 'flex';
            gameActive = false;
        }
    }
});

function checkCollision(pos) {
    const pBox = new THREE.Box3().setFromCenterAndSize(pos, new THREE.Vector3(player.radius, player.height, player.radius));
    for (let c of colliders) if (pBox.intersectsBox(c)) return true;
    return false;
}

function update() {
    if (!gameActive) return;
    
    const now = performance.now();
    const dt = (now - prevTime) / 1000;
    prevTime = now;

    accumulatedTime += dt;
    const totalElapsed = (accumulatedTime).toFixed(1);
    document.getElementById('timeVal').innerText = totalElapsed;

    // Player movement
    let speed = player.walkSpeed;
    if (player.run && player.stamina > 0 && !player.isExhausted) {
        speed = player.runSpeed;
        player.stamina -= dt * 60;
        if (player.stamina <= 0) player.isExhausted = true;
    } else {
        player.stamina += dt * 30;
        if (player.stamina > MAX_STAMINA) {
            player.stamina = MAX_STAMINA;
            player.isExhausted = false;
        }
    }
    document.getElementById('stamina-bar').style.width = (player.stamina / MAX_STAMINA) * 100 + '%';
    document.getElementById('stamina-bar').style.background = player.isExhausted ? 'linear-gradient(to bottom, #aa3333, #660000)' : 'linear-gradient(to bottom, #d4af37, #997a00)';

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    
    player.velocity.set(0, 0);
    if (keys['KeyW']) player.velocity.add(new THREE.Vector2(forward.x, forward.z));
    if (keys['KeyS']) player.velocity.sub(new THREE.Vector2(forward.x, forward.z));
    if (keys['KeyA']) player.velocity.sub(new THREE.Vector2(right.x, right.z));
    if (keys['KeyD']) player.velocity.add(new THREE.Vector2(right.x, right.z));
    
    if (player.velocity.lengthSq() > 0) {
        player.velocity.normalize().multiplyScalar(speed * dt * 60);
        
        const nextX = camera.position.clone(); nextX.x += player.velocity.x;
        if (!checkCollision(nextX)) camera.position.x = nextX.x;
        
        const nextZ = camera.position.clone(); nextZ.z += player.velocity.y;
        if (!checkCollision(nextZ)) camera.position.z = nextZ.z;
        
        player.headBobTimer += dt * (speed === player.runSpeed ? 15 : 10);
        camera.position.y = 6 + Math.sin(player.headBobTimer) * 0.15;
        
        if (gearGain && gearGain.gain.value < 0.3) gearGain.gain.value += 0.05;
        if (pistonGain && pistonGain.gain.value < 0.2) pistonGain.gain.value += 0.02;
    } else {
        if (gearGain && gearGain.gain.value > 0) gearGain.gain.value -= 0.05;
        if (pistonGain && pistonGain.gain.value > 0) pistonGain.gain.value -= 0.02;
        camera.position.y += (6 - camera.position.y) * 0.1;
    }

    // Phantom AI
    if (phantomActive) {
        const dirToPlayer = new THREE.Vector3().subVectors(camera.position, phantom.position);
        dirToPlayer.y = 0;
        const dist = dirToPlayer.length();
        
        if (dist > 0) {
            dirToPlayer.normalize();
            phantom.position.addScaledVector(dirToPlayer, phantomSpeed * dt * 60);
            phantomLight.position.copy(phantom.position);
            
            // Volume based on distance
            const vol = Math.max(0, 1 - (dist / 40));
            if (vaultGain) vaultGain.gain.value = vol * 0.4;
            if (klaxonGain) klaxonGain.gain.value = vol * 0.1;
        }
        
        // Death condition
        if (dist < 2.0) {
            gameActive = false;
            document.exitPointerLock();
            document.getElementById('death-screen-ui').style.display = 'block';
            document.getElementById('time-stat').innerText = totalElapsed + 's';
            document.getElementById('orb-stat').innerText = orbsCollected + ' / ' + totalOrbs;
            
            if(klaxonOsc) klaxonOsc.stop(); if(latchOsc) latchOsc.stop(); 
            if(pistonOsc) pistonOsc.stop(); if(gearOsc) gearOsc.stop(); 
            if(vaultOsc) vaultOsc.stop(); if(hissSrc) hissSrc.stop();
        }
    }

    // Orb collection
    for (let orb of orbs) {
        if (orb.active) {
            orb.mesh.position.y = 3 + Math.sin(now * 0.002 + orb.floatOffset) * 0.5;
            if (camera.position.distanceTo(orb.mesh.position) < 3) {
                orb.active = false;
                scene.remove(orb.mesh);
                scene.remove(orb.light);
                orbsCollected++;
                document.getElementById('orbCount').innerText = orbsCollected;
                document.getElementById('menuOrbCount').innerText = orbsCollected;
                if(latchGain) { latchGain.gain.value = 0.5; setTimeout(() => latchGain.gain.value = 0, 100); }
            }
        }
    }

    // Breach logic
    if (orbsCollected === totalOrbs && !hasPlayedSting) {
        hasPlayedSting = true;
        playSting();
        document.getElementById('lore-text').innerText = "THE BREACH IS OPEN. ESCAPE.";
        document.getElementById('lore-text').style.color = "#77ff77";
    }

    // Radar update
    rCtx.clearRect(0, 0, radarCanvas.width, radarCanvas.height);
    rCtx.fillStyle = 'rgba(0, 238, 255, 0.2)';
    rCtx.beginPath(); rCtx.arc(rCenter, rCenter, rCenter, 0, Math.PI * 2); rCtx.fill();
    
    rCtx.strokeStyle = 'rgba(0, 238, 255, 0.4)';
    rCtx.beginPath(); rCtx.moveTo(rCenter, 0); rCtx.lineTo(rCenter, radarCanvas.height); rCtx.stroke();
    rCtx.beginPath(); rCtx.moveTo(0, rCenter); rCtx.lineTo(radarCanvas.width, rCenter); rCtx.stroke();
    
    // Draw player center
    rCtx.fillStyle = '#fff';
    rCtx.beginPath(); rCtx.arc(rCenter, rCenter, 3, 0, Math.PI*2); rCtx.fill();

    function drawOnRadar(pos, color, size) {
        const dx = pos.x - camera.position.x;
        const dz = pos.z - camera.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < radarMaxDist) {
            const angle = Math.atan2(dz, dx) - yaw + Math.PI/2;
            const rx = rCenter + Math.cos(angle) * dist * radarScale;
            const ry = rCenter + Math.sin(angle) * dist * radarScale;
            rCtx.fillStyle = color;
            rCtx.beginPath(); rCtx.arc(rx, ry, size, 0, Math.PI*2); rCtx.fill();
        }
    }

    // Draw Orbs
    for (let orb of orbs) if (orb.active) drawOnRadar(orb.mesh.position, '#00eeff', 3);
    
    // Draw Phantom
    if (phantomActive) drawOnRadar(phantom.position, '#ff0000', 4);
    
    // Draw Breach
    if (orbsCollected === totalOrbs) drawOnRadar(breachPos, '#77ff77', 5);

    // Dust animation
    const positions = dustGeo.attributes.position.array;
    for(let i=1; i<dustCount*3; i+=3) {
        positions[i] -= dt * 2;
        if(positions[i] < 0) positions[i] = 12;
    }
    dustGeo.attributes.position.needsUpdate = true;

    // Win condition
    if (orbsCollected === totalOrbs && camera.position.distanceTo(breachPos) < 4) {
        gameActive = false;
        gameWon = true;
        document.exitPointerLock();
        
        // Fade out screen and fade in text simultaneously
        const winScreen = document.getElementById('win-screen');
        const fadeBlack = document.getElementById('fade-black');
        
        winScreen.style.display = 'flex';
        // Small delay to ensure display:flex is registered before fading
        setTimeout(() => {
            fadeBlack.style.opacity = '1';
            winScreen.style.opacity = '1';
        }, 50);

        document.getElementById('finalTime').innerText = `FINAL TIME: ${totalElapsed}s`;
        if(klaxonOsc) klaxonOsc.stop(); if(latchOsc) latchOsc.stop(); if(pistonOsc) pistonOsc.stop(); if(gearOsc) gearOsc.stop(); if(vaultOsc) vaultOsc.stop(); if(hissSrc) hissSrc.stop();
    }
}

function animate() { requestAnimationFrame(animate); update(); renderer.render(scene, camera); } animate();
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
// Reboot Button Logic
document.getElementById('reboot-btn').addEventListener('click', () => {
    const deathUI = document.getElementById('death-screen-ui');
    deathUI.style.transition = 'opacity 0.5s';
    deathUI.style.opacity = '0';
    setTimeout(() => { location.reload(); }, 500);
});
