// --- GAME STATE ---
const state = {
    cash: 50,
    wood: 0,
    maxWood: 10,
    storeWood: 0,
    price: 10,
    axeLevel: 1,
    axeSlot: 1,
    time: 8 * 60, // Minutes since 8:00 AM
    dayActive: true,
    activeSlot: 1,
    treeMaxHealth: 50,
    dailySold: 0,
    dailyRev: 0
};

// --- ASSET MANAGER ---
const models = {
    log: null,
    plank: null, // Ready for your next asset
    saw: null,   // Ready for your next asset
    shed: null   // Ready for your next asset
};

const forestParts = [];
const droppedItems = [];
const dummy = new THREE.Object3D(); // Used for calculating InstancedMesh matrix
const treeCount = 100; // Adjust this for how dense you want the forest
let treeHealthArray = new Array(treeCount).fill(state.treeMaxHealth);

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.Fog(0x87ceeb, 10, 100);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 2; // Player height

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
light.position.set(0, 20, 0);
scene.add(light);

// --- ENVIRONMENT ---
const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshBasicMaterial({ color: 0x228B22 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Terminals
const terminals = [];
const boxGeo = new THREE.BoxGeometry(2, 2, 2);

const invTerminal = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x0000ff }));
invTerminal.position.set(-5, 1, -5);
invTerminal.userData = { type: 'inventory' };
scene.add(invTerminal);
terminals.push(invTerminal);

const storeTerminal = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x00ff00 }));
storeTerminal.position.set(0, 1, -5);
storeTerminal.userData = { type: 'store' };
scene.add(storeTerminal);
terminals.push(storeTerminal);

const upTerminal = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x800080 }));
upTerminal.position.set(5, 1, -5);
upTerminal.userData = { type: 'upgrade' };
scene.add(upTerminal);
terminals.push(upTerminal);

// --- MASTER LOADER ---
const loadingManager = new THREE.LoadingManager();

loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
    document.querySelector('#blocker h1').innerText = `LOADING... ${Math.round((itemsLoaded / itemsTotal) * 100)}%`;
    document.querySelector('#blocker p').style.display = 'none'; // Hide instructions while loading
};

loadingManager.onLoad = function() {
    // EVERYTHING is downloaded! Now we can safely build the world.
    document.querySelector('#blocker h1').innerText = "Timber Harvest";
    document.querySelector('#blocker p').style.display = 'block';
    document.querySelector('#blocker p').innerText = "Click to Start";
    
    // Only populate the forest once we know the tree is ready
    if (forestParts.length > 0) populateForest();
};

const gltfLoader = new THREE.GLTFLoader(loadingManager);

// 1. Load Trees
gltfLoader.load('objects/low_poly_tree.glb', function (gltf) {
    gltf.scene.traverse(function(child) {
        if (child.isMesh) {
            const instancedPart = new THREE.InstancedMesh(child.geometry, child.material, treeCount);
            forestParts.push(instancedPart);
            scene.add(instancedPart);
        }
    });
});

// 2. Load Logs
gltfLoader.load('objects/logs.glb', function(gltf) {
    gltf.scene.traverse(function(child) {
        if (child.isMesh) {
            models.log = child; 
            models.log.geometry.center(); 
            models.log.material = new THREE.MeshLambertMaterial({ color: 0x654321 }); 
            models.log.material.needsUpdate = true;
        }
    });

    // Auto-scale logs to exactly 2 units
    if (models.log) {
        const box = new THREE.Box3().setFromObject(models.log);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const scaleFactor = 2 / maxDim; 
            models.log.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }
    }
});

// 3. Load Planks (Placeholder for when you get the file!)
// gltfLoader.load('objects/plank.glb', function(gltf) { ... });

// 4. Load Saw (Placeholder for when you get the file!)
// gltfLoader.load('objects/saw.glb', function(gltf) { ... });

// --- BOUNDARY FENCES ---
const wallGeo = new THREE.BoxGeometry(200, 20, 2);
const wallMat = new THREE.MeshBasicMaterial({ color: 0x001100 }); // Very dark green placeholder

const wallN = new THREE.Mesh(wallGeo, wallMat);
wallN.position.set(0, 10, -100);
scene.add(wallN);

const wallS = new THREE.Mesh(wallGeo, wallMat);
wallS.position.set(0, 10, 100);
scene.add(wallS);

const wallE = new THREE.Mesh(wallGeo, wallMat);
wallE.rotation.y = Math.PI / 2;
wallE.position.set(100, 10, 0);
scene.add(wallE);

const wallW = new THREE.Mesh(wallGeo, wallMat);
wallW.rotation.y = Math.PI / 2;
wallW.position.set(-100, 10, 0);
scene.add(wallW);

// --- CONTROLS & MOVEMENT ---
const controls = new THREE.PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');

blocker.addEventListener('click', () => { if (state.dayActive) controls.lock(); });
controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
controls.addEventListener('unlock', () => { 
    if(state.dayActive && !document.querySelector('.modal[style*="display: block"]')) {
        blocker.style.display = 'flex'; 
    }
});

const moveState = { forward: false, backward: false, left: false, right: false };
document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') moveState.forward = true;
    if (e.code === 'KeyS') moveState.backward = true;
    if (e.code === 'KeyA') moveState.left = true;
    if (e.code === 'KeyD') moveState.right = true;
    
    // Hotbar Selection
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        const slotNumber = parseInt(e.key);
        state.activeSlot = slotNumber;
        document.querySelectorAll('.slot').forEach(el => el.classList.remove('active'));
        document.getElementById('slot-' + slotNumber).classList.add('active');
    }
});
document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') moveState.forward = false;
    if (e.code === 'KeyS') moveState.backward = false;
    if (e.code === 'KeyA') moveState.left = false;
    if (e.code === 'KeyD') moveState.right = false;
});

// --- RAYCASTING (INTERACTIONS) ---
const raycaster = new THREE.Raycaster();
document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked || !state.dayActive) return;

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Check Terminals
    const terminalIntersects = raycaster.intersectObjects(terminals);
    if (terminalIntersects.length > 0) {
        const type = terminalIntersects[0].object.userData.type;
        controls.unlock();
        openModal(type);
        return;
    }

    // --- Check Dropped Items (Logs) ---
    if (droppedItems.length > 0) {
        const itemIntersects = raycaster.intersectObjects(droppedItems);
        
        if (itemIntersects.length > 0) {
            const clickedHitBox = itemIntersects[0].object;
            const playerPos = controls.getObject().position;
            
            if (playerPos.distanceTo(clickedHitBox.position) < 15) { 
                
                // TRY TO INJECT THE VISUAL BOX FIRST
                if (window.injectWoodIntoGrid()) {
                    
                    // If successful, delete the 3D models from the ground
                    scene.remove(clickedHitBox); 
                    scene.remove(clickedHitBox.userData.visual); 
                    
                    const index = droppedItems.indexOf(clickedHitBox);
                    if (index > -1) droppedItems.splice(index, 1);
                    
                    updateHUD();
                    return; 
                } else {
                    console.log("Inventory grid is full!");
                }
            }
        }
    }

    // Check Forest
    if (forestParts.length === 0) return; 
    const forestIntersects = raycaster.intersectObjects(forestParts);
    
    if (forestIntersects.length > 0) {
        const instanceId = forestIntersects[0].instanceId;
        
        forestParts[0].getMatrixAt(instanceId, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

        // If tree is standing and Axe is equipped
        if (dummy.scale.y > 0 && state.activeSlot === state.axeSlot) {
            
            treeHealthArray[instanceId] -= state.axeLevel;

            // Show Damage Number
            const hitText = document.getElementById('hit-text');
            hitText.innerText = "-" + state.axeLevel + " (HP: " + treeHealthArray[instanceId] + ")";
            hitText.style.opacity = 1;
            
            // RED HIT FLASH
            const color = new THREE.Color();
            forestParts.forEach(part => {
                part.setColorAt(instanceId, color.setHex(0xff0000));
                part.instanceColor.needsUpdate = true;
            });
            
            setTimeout(() => {
                hitText.style.opacity = 0; // Fade out text
                if (forestParts[0]) {
                    forestParts.forEach(part => {
                        part.setColorAt(instanceId, color.setHex(0xffffff));
                        part.instanceColor.needsUpdate = true;
                    });
                }
            }, 150);
            
            // TREE BREAKS
            if (treeHealthArray[instanceId] <= 0) {
                // Hide tree
                dummy.scale.set(0, 0, 0); 
                dummy.updateMatrix();
                
                forestParts.forEach(part => {
                    part.setMatrixAt(instanceId, dummy.matrix);
                    part.instanceMatrix.needsUpdate = true;
                });
                
                // Spawn physical logs at the tree's coordinates
                spawnLogs(dummy.position.x, dummy.position.z);
            }
        }
    }
});

// --- UI & LOGIC FUNCTIONS ---
function updateHUD() {
    document.getElementById('cashDisplay').innerText = state.cash;
    document.getElementById('invDisplay').innerText = state.wood;
    document.getElementById('maxInvDisplay').innerText = state.maxWood;
    document.getElementById('storeDisplay').innerText = state.storeWood;

    document.getElementById('modInvVal').innerText = state.wood;
    document.getElementById('modStoreVal').innerText = state.storeWood;
    document.getElementById('modPriceVal').innerText = state.price;
}

let woodIdCounter = 0; // Ensures every log gets a unique ID

function initInventory() {
    const modalHotbar = document.getElementById('modal-hotbar');
    const modalBackpack = document.getElementById('modal-backpack');
    
    // Build the 4 Hotbar Slots
    for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        slot.ondragover = allowDrop;
        slot.ondrop = drop;
        modalHotbar.appendChild(slot);
    }
    
    // Spawn the Axe in Slot 1
    modalHotbar.children[0].innerHTML = `<div class="item axe-item" draggable="true" ondragstart="drag(event)" id="item-axe">Axe Lv.${state.axeLevel}</div>`;
    
    // Build the initial Backpack slots
    for (let i = 0; i < state.maxWood; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        slot.ondragover = allowDrop;
        slot.ondrop = drop;
        modalBackpack.appendChild(slot);
    }
    syncHotbarHUD();
}

function syncHotbarHUD() {
    const hotbarSlots = document.getElementById('modal-hotbar').children;
    let axeFound = false;
    
    // Read the first 4 slots to update the bottom-screen HUD
    for (let i = 0; i < 4; i++) {
        const item = hotbarSlots[i].firstElementChild;
        const uiSlotItem = document.getElementById('slot-' + (i + 1) + '-item');
        
        if (item && item.classList.contains('axe-item')) {
            state.axeSlot = i + 1;
            uiSlotItem.innerText = 'Axe Lv.' + state.axeLevel;
            axeFound = true;
        } else if (item && item.classList.contains('wood-item')) {
            uiSlotItem.innerText = 'Wood';
        } else {
            uiSlotItem.innerText = 'Empty';
        }
    }
    
    // If the player dragged the axe into the backpack, it is unequipped!
    if (!axeFound) {
        state.axeSlot = 0; 
    }
}

function buildInventoryUI() {
    const modalHotbar = document.getElementById('modal-hotbar');
    const modalBackpack = document.getElementById('modal-backpack');
    document.getElementById('invMaxDisplay').innerText = state.maxWood;
    
    // Clear old UI to prevent duplication
    modalHotbar.innerHTML = '';
    modalBackpack.innerHTML = '';

    // 1. Build the 4 Hotbar Slots
    for (let i = 1; i <= 4; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        slot.ondragover = allowDrop;
        slot.ondrop = drop;
        
        // Put the axe in the exact slot the player assigned it
        if (i === state.axeSlot) {
            slot.innerHTML = `<div class="item axe-item" draggable="true" ondragstart="drag(event)" id="item-axe">Axe Lv.${state.axeLevel}</div>`;
        }
        modalHotbar.appendChild(slot);
    }

    // 2. Build Backpack Slots based on state.maxWood
    let woodToPlace = state.wood;
    for (let i = 0; i < state.maxWood; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        slot.ondragover = allowDrop;
        slot.ondrop = drop;
        
        // Spawn physical wood blocks until we match your total inventory count
        if (woodToPlace > 0) {
            slot.innerHTML = `<div class="item wood-item" draggable="true" ondragstart="drag(event)" id="wood-${i}">Wood</div>`;
            woodToPlace--;
        }
        modalBackpack.appendChild(slot);
    }
}

// --- GENERATION LOGIC ---
function populateForest() {
    if (forestParts.length === 0) return;
    
    // Reset the tree health array for the new day
    treeHealthArray = new Array(treeCount).fill(state.treeMaxHealth);
    
    // Grab the instanced mesh (we assume index 0 based on your loader logic)
    const instancedTrees = forestParts[0];
    
    for (let i = 0; i < treeCount; i++) {
        // Randomize positions, keeping them within the 200x200 ground
        dummy.position.set(
            (Math.random() - 0.5) * 180, 
            0, 
            (Math.random() - 0.5) * 180
        );
        
        // Keep trees out of the center where the store/terminals are
        if (Math.abs(dummy.position.x) < 20 && Math.abs(dummy.position.z) < 20) {
            dummy.position.x += 30; 
        }
        dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
        
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        
        instancedTrees.setMatrixAt(i, dummy.matrix);
    }
    instancedTrees.instanceMatrix.needsUpdate = true;
}

function spawnLogs(treeX, treeZ) {
    if (!models.log) return;
    
    const logsToDrop = 3; // How much wood a tree yields
    
    for (let i = 0; i < logsToDrop; i++) {
        const newLog = models.log.clone();
        
        // Scatter them slightly around the stump
        newLog.position.set(
            treeX + (Math.random() * 2 - 1), 
            0.5, 
            treeZ + (Math.random() * 2 - 1)
        );
        
        // Create an invisible hitbox for the raycaster
        const hitBoxGeo = new THREE.BoxGeometry(2, 2, 2);
        const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
        
        hitBox.position.copy(newLog.position);
        hitBox.userData = { visual: newLog }; // Link to the 3D model so we can delete it later
        
        scene.add(newLog);
        scene.add(hitBox);
        droppedItems.push(hitBox);
    }
}

function openModal(type) {
    document.getElementById(type + 'Modal').style.display = 'block';
    if (type === 'inventory') {
        document.getElementById('invMaxDisplay').innerText = state.maxWood;
    }
    updateHUD();
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    syncHotbarHUD(); // Lock in whatever layout the player dragged around
    if (state.dayActive) controls.lock();
}

window.moveToStore = () => {
    // Physically find all wood items in the grid and delete them
    const woods = document.querySelectorAll('.wood-item');
    woods.forEach(w => w.remove());
    
    state.storeWood += woods.length;
    state.wood = 0;
    
    syncHotbarHUD();
    updateHUD();
};

window.dropToStore = (ev) => {
    ev.preventDefault();
    if (draggedItem && draggedItem.classList.contains('wood-item')) {
        draggedItem.remove(); // Delete visual item from the grid
        state.wood--;
        state.storeWood++;
        syncHotbarHUD();
        updateHUD();
    }
};

function injectWoodIntoGrid() {
    const allSlots = document.querySelectorAll('.inv-slot');
    for (let i = 0; i < allSlots.length; i++) {
        if (allSlots[i].children.length === 0) { // Found an empty slot!
            const woodNode = document.createElement('div');
            woodNode.className = 'item wood-item';
            woodNode.draggable = true;
            woodNode.ondragstart = drag;
            woodNode.id = 'wood-' + woodIdCounter++;
            woodNode.innerText = 'Wood';
            allSlots[i].appendChild(woodNode);
            state.wood++;
            syncHotbarHUD();
            return true; // Successfully added
        }
    }
    return false; // No empty slots left
}

// --- DRAG AND DROP LOGIC ---
let draggedItem = null;

window.drag = (ev) => {
    draggedItem = ev.target;
    ev.dataTransfer.setData("text", ev.target.id);
};

window.allowDrop = (ev) => { ev.preventDefault(); };

window.drop = (ev) => {
    ev.preventDefault();
    const target = ev.target;
    
    // If dropping onto an empty slot
    if (target.classList.contains('inv-slot') && target.children.length === 0) {
        target.appendChild(draggedItem);
    } 
    // If dropping onto another item, instantly swap their positions
    else if (target.classList.contains('item')) {
        const parentSlot = target.parentNode;
        const originalSlot = draggedItem.parentNode;
        parentSlot.appendChild(draggedItem);
        originalSlot.appendChild(target);
    }
};

window.dropToStore = (ev) => {
    ev.preventDefault();
    // Only allow wood to be sold, protect the Axe!
    if (draggedItem && draggedItem.classList.contains('wood-item')) {
        draggedItem.remove(); // Delete visual item
        state.wood--;
        state.storeWood++;
        updateHUD();
    }
};

// Creates the physical HTML box and drops it into an empty slot
window.injectWoodIntoGrid = () => {
    const allSlots = document.querySelectorAll('.inv-slot');
    for (let i = 0; i < allSlots.length; i++) {
        if (allSlots[i].children.length === 0) { // Found the first empty slot!
            const woodNode = document.createElement('div');
            woodNode.className = 'item wood-item';
            woodNode.draggable = true;
            woodNode.ondragstart = window.drag;
            woodNode.id = 'wood-' + Math.floor(Math.random() * 1000000); // Unique ID
            woodNode.innerText = 'Wood';
            
            allSlots[i].appendChild(woodNode);
            state.wood++; // Update the math
            syncHotbarHUD();
            return true; // Successfully added
        }
    }
    return false; // Inventory is completely full
}

window.moveToStore = () => {
    state.storeWood += state.wood;
    state.wood = 0;
    updateHUD();
};

window.changePrice = (amount) => {
    if (state.price + amount >= 1) state.price += amount;
    updateHUD();
};

window.buyUpgrade = (type) => {
    if (type === 'axe' && state.cash >= 50) {
        state.cash -= 50;
        state.axeLevel++;
        document.getElementById('axeLvl').innerText = state.axeLevel;
        
        // Update the physical draggable item
        const axeDom = document.getElementById('item-axe');
        if (axeDom) axeDom.innerText = 'Axe Lv.' + state.axeLevel;
        syncHotbarHUD();
        
    } else if (type === 'inv' && state.cash >= 100) {
        state.cash -= 100;
        state.maxWood += 10;
        document.getElementById('invMax').innerText = state.maxWood;
        
        // Add 10 new physical slots to the backpack grid
        const modalBackpack = document.getElementById('modal-backpack');
        for (let i = 0; i < 10; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            slot.ondragover = allowDrop;
            slot.ondrop = drop;
            modalBackpack.appendChild(slot);
        }
    }
    updateHUD();
};

// --- GAME LOOP & ECONOMY ---
let lastTime = performance.now();
const clockSpeed = 5; 

function animate() {
    requestAnimationFrame(animate);
    const timeNow = performance.now();
    const delta = (timeNow - lastTime) / 1000;
    lastTime = timeNow;

    if (controls.isLocked) {
        const speed = 15 * delta;
        if (moveState.forward) controls.moveForward(speed);
        if (moveState.backward) controls.moveForward(-speed);
        if (moveState.left) controls.moveRight(-speed);
        if (moveState.right) controls.moveRight(speed);

        // Enforce Map Boundaries
        const pos = controls.getObject().position;
        if (pos.x > 95) pos.x = 95;
        if (pos.x < -95) pos.x = -95;
        if (pos.z > 95) pos.z = 95;
        if (pos.z < -95) pos.z = -95;
    }

    if (state.dayActive) {
        state.time += delta * clockSpeed; 
        let hours = Math.floor(state.time / 60);
        let mins = Math.floor(state.time % 60);
        document.getElementById('timeDisplay').innerText = 
            `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

        if (hours >= 20 && state.dayActive) { 
            // It is 8 PM. Shut down the economy and stop the clock, but KEEP controls active!
            state.dayActive = false;
            document.getElementById('sleepBtn').style.display = 'block';
            document.getElementById('sleepBtn').style.top = '20px'; // Move it to top right
            document.getElementById('sleepBtn').style.right = '20px';
            document.getElementById('sleepBtn').style.left = 'auto';
            document.getElementById('sleepBtn').style.transform = 'none';
        }

        if (state.storeWood > 0 && Math.random() < (0.01 / (state.price * 0.1))) {
            state.storeWood--;
            state.cash += state.price;
            state.dailySold++;
            state.dailyRev += state.price;
            updateHUD();
        }
    }

    renderer.render(scene, camera);
}

// --- SETTLEMENT ACTIONS ---
window.triggerSleep = () => {
    document.getElementById('sleepBtn').style.display = 'none';
    closeModals();
    document.getElementById('endOfDayScreen').style.display = 'flex';
    document.getElementById('eodUnits').innerText = state.dailySold;
    document.getElementById('eodRev').innerText = state.dailyRev;
    document.getElementById('eodTotal').innerText = state.cash;
};

window.startNextDay = () => {
    document.getElementById('endOfDayScreen').style.display = 'none';
    state.time = 8 * 60;
    state.dailySold = 0;
    state.dailyRev = 0;
    state.dayActive = true;
    populateForest(); 
    blocker.style.display = 'flex'; 
    updateHUD();
};

initInventory();
animate();
updateHUD();
