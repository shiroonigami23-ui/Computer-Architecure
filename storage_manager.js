// This file manages all logic for saving and loading circuits
// --- *** MODIFIED: Uses Firebase Firestore instead of localStorage *** ---

const StorageManager = {
    // --- 1. UI Elements ---
    saveModalBackdrop: null,
    saveModal: null,
    saveNameInput: null,
    saveConfirmBtn: null,
    
    loadModalBackdrop: null,
    loadModal: null,
    loadList: null,

    saveCircuitBtn: null,
    loadCircuitBtn: null,

    // --- 2. Firebase State ---
    currentUserId: null,
    savedCircuits: [], // Local cache of cloud circuits
    unsubscribeFromSaves: null, // Function to stop the Firestore listener

    /**
     * Finds all modal elements and hooks up all event listeners.
     */
    init: function() {
        console.log("Storage Manager initializing...");
        
        // This is just a safety check
        if (!window.firebase) {
            console.error("Firebase SDK not loaded. Storage Manager cannot start.");
            return;
        }

        // --- Find Save Modal Elements ---
        this.saveModalBackdrop = document.getElementById('save-modal-backdrop');
        this.saveModal = document.getElementById('save-modal');
        this.saveNameInput = document.getElementById('save-circuit-name');
        this.saveConfirmBtn = document.getElementById('save-modal-confirm-btn');
        const saveModalCloseBtn = document.getElementById('save-modal-close-btn');
        const saveModalCancelBtn = document.getElementById('save-modal-cancel-btn');
        
        // --- Find Load Modal Elements ---
        this.loadModalBackdrop = document.getElementById('load-modal-backdrop');
        this.loadModal = document.getElementById('load-modal');
        this.loadList = document.getElementById('load-circuit-list');
        const loadModalCloseBtn = document.getElementById('load-modal-close-btn');
        const loadModalCancelBtn = document.getElementById('load-modal-cancel-btn');
        
        // --- Find Toolbar Buttons ---
        this.saveCircuitBtn = document.getElementById('save-circuit-btn');
        this.loadCircuitBtn = document.getElementById('load-circuit-btn');

        // --- Hook up Toolbar Listeners ---
        this.saveCircuitBtn?.addEventListener('click', () => this.openSaveModal());
        this.loadCircuitBtn?.addEventListener('click', () => this.openLoadModal());

        // --- Hook up Save Modal Listeners ---
        saveModalCloseBtn?.addEventListener('click', () => this.closeSaveModal());
        saveModalCancelBtn?.addEventListener('click', () => this.closeSaveModal());
        this.saveModalBackdrop?.addEventListener('click', (e) => {
            if (e.target === this.saveModalBackdrop) this.closeSaveModal();
        });
        this.saveConfirmBtn?.addEventListener('click', () => this.handleSaveCircuit());
        
        // --- Hook up Load Modal Listeners ---
        loadModalCloseBtn?.addEventListener('click', () => this.closeLoadModal());
        loadModalCancelBtn?.addEventListener('click', () => this.closeLoadModal());
        this.loadModalBackdrop?.addEventListener('click', (e) => {
            if (e.target === this.loadModalBackdrop) this.closeLoadModal();
        });
        
        this.loadList?.addEventListener('click', (e) => {
            const item = e.target.closest('.load-item');
            if (!item) return;

            const deleteBtn = e.target.closest('.load-item-delete');
            const circuitName = item.dataset.name;

            if (deleteBtn) {
                e.stopPropagation(); 
                this.handleDeleteCircuit(circuitName);
            } else {
                this.handleLoadCircuit(circuitName);
            }
        });

        // --- Disable buttons by default ---
        // They will be enabled by onUserLogin()
        this.setStorageButtonsDisabled(true);
    },

    /**
     * Called by AuthManager when a user successfully logs in.
     * @param {string} userId - The new user's ID.
     */
    onUserLogin: function(userId) {
        console.log("Storage Manager: User logged in, enabling cloud save.");
        this.currentUserId = userId;
        this.setStorageButtonsDisabled(false);
        this.subscribeToCircuitSaves();
    },

    /**
     * Called by AuthManager when the user logs out.
     */
    onUserLogout: function() {
        console.log("Storage Manager: User logged out, disabling cloud save.");
        this.currentUserId = null;
        this.setStorageButtonsDisabled(true);
        
        // Stop listening to the old user's data
        if (this.unsubscribeFromSaves) {
            this.unsubscribeFromSaves();
            this.unsubscribeFromSaves = null;
        }
        
        this.savedCircuits = [];
        this.populateLoadModal(); // Clear the list
    },

    /**
     * Toggles the disabled state of the Save/Load buttons.
     * @param {boolean} isDisabled - True to disable, false to enable.
     */
    setStorageButtonsDisabled: function(isDisabled) {
        if (this.saveCircuitBtn) {
            this.saveCircuitBtn.disabled = isDisabled;
            this.saveCircuitBtn.title = isDisabled 
                ? "Login to save to the cloud" 
                : "Save As...";
        }
        if (this.loadCircuitBtn) {
            this.loadCircuitBtn.disabled = isDisabled;
            this.loadCircuitBtn.title = isDisabled 
                ? "Login to load from the cloud" 
                : "Load Project";
        }
    },

    // --- 3. Modal Control ---

    openSaveModal: function() {
        if (!this.saveModalBackdrop || !this.currentUserId) return;
        
        this.saveNameInput.value = ''; // Clear old name
        this.saveNameInput.disabled = false;
        this.saveConfirmBtn.disabled = false;
        
        // Remove AI loader (we removed this feature to simplify)
        const aiLoader = document.getElementById('ai-name-loading');
        if(aiLoader) aiLoader.classList.add('hidden');
        
        this.saveNameInput.placeholder = "My Circuit Name";
        this.saveModalBackdrop.classList.remove('hidden');
        this.saveNameInput.focus();
    },
    
    closeSaveModal: function() {
        this.saveModalBackdrop?.classList.add('hidden');
    },
    
    openLoadModal: function() {
        if (!this.loadModalBackdrop || !this.currentUserId) return;
        // The list is already populated by the onSnapshot listener
        this.loadModalBackdrop.classList.remove('hidden');
    },

    closeLoadModal: function() {
        this.loadModalBackdrop?.classList.add('hidden');
    },

    // --- 4. Core Firestore Functions ---

    /**
     * Subscribes to the user's private circuit collection in Firestore.
     */
    subscribeToCircuitSaves: function() {
        if (!this.currentUserId || !AuthManager.db) {
            console.warn("StorageManager: Cannot subscribe, user or DB not ready.");
            return;
        }

        // Unsubscribe from any previous listener
        if (this.unsubscribeFromSaves) this.unsubscribeFromSaves();
        
        const { collection, query, onSnapshot } = window.firebase;
        const db = AuthManager.db;
        // --- FIX: Get appId from AuthManager ---
        const appId = AuthManager.getProjectId(); 
        
        try {
            const collectionPath = `artifacts/${appId}/users/${this.currentUserId}/circuits`;
            const q = query(collection(db, collectionPath));
            
            console.log(`Subscribing to circuit list at: ${collectionPath}`);

            this.unsubscribeFromSaves = onSnapshot(q, (querySnapshot) => {
                this.savedCircuits = [];
                querySnapshot.forEach((doc) => {
                    this.savedCircuits.push({
                        id: doc.id, // The name is the ID
                        ...doc.data()
                    });
                });
                
                // Sort by save date, newest first
                this.savedCircuits.sort((a, b) => {
                    const dateA = a.savedAt?.toDate ? a.savedAt.toDate() : 0;
                    const dateB = b.savedAt?.toDate ? b.savedAt.toDate() : 0;
                    return dateB - dateA;
                });

                console.log(`Cloud data updated. Found ${this.savedCircuits.length} circuits.`);
                this.populateLoadModal(); // Refresh the load modal list
                
            }, (error) => {
                console.error("Error listening to circuit saves:", error);
                AnimationManager.logError(`Cloud Error: ${error.message}`);
            });
            
        } catch (error) {
            console.error("Error setting up circuit subscription:", error);
            AnimationManager.logError(`Cloud Error: ${error.message}`);
        }
    },

    /**
     * Saves the current circuit to Firestore using the name as the document ID.
     */
    handleSaveCircuit: async function() {
        const name = this.saveNameInput.value.trim();
        if (!name) {
            Main.updateStatus("Please enter a circuit name.");
            return;
        }
        
        if (!this.currentUserId || !AuthManager.db) {
            Main.updateStatus("Error: Not logged in. Cannot save.");
            return;
        }

        // Get functions from global
        const { doc, setDoc, serverTimestamp } = window.firebase;
        const db = AuthManager.db;
        // --- FIX: Get appId from AuthManager ---
        const appId = AuthManager.getProjectId();
        
        try {
            // Get the circuit data from the simulator
            const circuitData = Simulator.getCircuitData(); 
            if (!circuitData) {
                 Main.updateStatus("Error: Could not get circuit data to save.");
                 return;
            }
            
            // --- To be 100% safe, we stringify the complex data ---
            // This ensures it saves to Firestore without issues.
            const dataToSave = {
                name: name,
                savedAt: serverTimestamp(),
                // Store the circuit data as a single JSON string
                circuitData: JSON.stringify(circuitData) 
            };

            // Create a document reference using the *name* as the ID
            const docRef = doc(db, "artifacts", appId, "users", this.currentUserId, "circuits", name);

            this.saveConfirmBtn.disabled = true;
            this.saveNameInput.disabled = true;
            Main.updateStatus(`Saving "${name}" to the cloud...`);

            // Use setDoc to create or overwrite the document
            await setDoc(docRef, dataToSave);
            
            AnimationManager.logStep(`Circuit saved as \`${name}\`.`);
            this.closeSaveModal();

        } catch (e) {
            console.error("Error saving circuit to Firestore:", e);
            AnimationManager.logError(`Could not save circuit: ${e.message}`);
        } finally {
            this.saveConfirmBtn.disabled = false;
            this.saveNameInput.disabled = false;
        }
    },
    
    /**
     * Loads a circuit from the local cache (which is populated by Firestore).
     * @param {string} name - The name of the circuit to load.
     */
    handleLoadCircuit: function(name) {
        if (!name) return;
        
        // Find the circuit in our local cache
        const circuitSave = this.savedCircuits.find(c => c.id === name);
        
        if (!circuitSave || !circuitSave.circuitData) {
            AnimationManager.logError(`Could not find circuit data for \`${name}\`.`);
            return;
        }
        
        // --- Use a simple confirm for now ---
        // We can replace this with a custom modal later
        if (!confirm(`Are you sure you want to load "${name}"?\nYour current circuit will be replaced.`)) {
            return;
        }
        
        try {
            // --- Parse the JSON string back into an object ---
            const circuitData = JSON.parse(circuitSave.circuitData);
            
            Simulator.loadCircuitData(circuitData); 
            
            this.closeLoadModal();
            AnimationManager.logStep(`Cloud circuit \`${name}\` loaded successfully.`);
            AnimationManager.startSimulation(); 
            Simulator.autoSaveCircuit(); // Re-save to local auto-save

        } catch (e) {
            console.error("Error loading circuit:", e);
            AnimationManager.logError(`Could not load circuit \`${name}\`: ${e.message}`);
        }
    },
    
    /**
     * Deletes a circuit from Firestore.
     * @param {string} name - The name of the circuit to delete.
     */
    handleDeleteCircuit: async function(name) {
        if (!name || !this.currentUserId || !AuthManager.db) {
            AnimationManager.logError("Error: Not logged in. Cannot delete.");
            return;
        }
        
        if (!confirm(`Are you sure you want to delete "${name}"?\nThis action cannot be undone.`)) {
            return;
FS        }

        const { doc, deleteDoc } = window.firebase;
        const db = AuthManager.db;
        // --- FIX: Get appId from AuthManager ---
        const appId = AuthManager.getProjectId();

        try {
            // Create a reference to the document
            const docRef = doc(db, "artifacts", appId, "users", this.currentUserId, "circuits", name);
            
            Main.updateStatus(`Deleting "${name}" from the cloud...`);
            
            await deleteDoc(docRef);
            
            AnimationManager.logStep(`Circuit \`${name}\` deleted.`);
            // The onSnapshot listener will automatically refresh the list

        } catch (e) {
            console.error("Error deleting circuit:", e);
            AnimationManager.logError(`Could not delete circuit: ${e.message}`);
        }
    },

    /**
     * Re-populates the "Load" modal list based on the local cache.
     */
    populateLoadModal: function() {
        if (!this.loadList) return;
        
        this.loadList.innerHTML = ''; // Clear existing list
        
        if (this.savedCircuits.length === 0) {
            this.loadList.innerHTML = '<p style="padding: 20px; text-align: center;">No cloud circuits found. Try saving one!</p>';
            return;
        }

        for (const circuit of this.savedCircuits) {
            const item = document.createElement('div');
            item.className = 'load-item';
            item.dataset.name = circuit.id; // Use the ID (which is the name)
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'load-item-name';
            nameSpan.textContent = circuit.name;
            
            const dateSpan = document.createElement('span');
            dateSpan.className = 'load-item-date';
            // Handle Firestore timestamp
            let saveDate = "Just now";
            if (circuit.savedAt && typeof circuit.savedAt.toDate === 'function') {
                 saveDate = circuit.savedAt.toDate().toLocaleString();
            } else if (circuit.savedAt) {
                 saveDate = new Date(circuit.savedAt).toLocaleString(); // Fallback
            }
            dateSpan.textContent = saveDate;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'load-item-delete';
            deleteBtn.title = 'Delete circuit';
            deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            
            const nameAndDate = document.createElement('div');
            nameAndDate.style.display = 'flex';
            nameAndDate.style.flexDirection = 'column';
            nameAndDate.appendChild(nameSpan);
            nameAndDate.appendChild(dateSpan);
            
            item.appendChild(nameAndDate);
            item.appendChild(deleteBtn);
            this.loadList.appendChild(item);
        }
        // Refresh icons
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    }
};
