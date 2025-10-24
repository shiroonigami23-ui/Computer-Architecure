// This file manages all logic for saving and loading circuits
// It controls the save/load modals and interacts with localStorage
// --- NEW: It now automatically suggests a name on "Save As..." ---

const StorageManager = {
    // --- Constants ---
    STORAGE_KEY: 'web-logisim-saves',

    // --- UI Elements ---
    saveModalBackdrop: null,
    saveModal: null,
    saveNameInput: null,
    // --- REMOVED: aiNameButton ---
    aiNameLoading: null,
    saveConfirmBtn: null,
    
    loadModalBackdrop: null,
    loadModal: null,
    loadList: null,
    
    // --- AI Naming ---
    AI_NAME_SYSTEM_PROMPT: `You are an expert digital logic circuit analyst.
You will be given a JSON object summarizing a logic circuit.
Your ONLY task is to analyze this circuit and return a concise, accurate name for what it is.
- Respond with ONLY the name (e..g, "Full Adder", "SR Latch", "2-to-1 Multiplexer").
- Do NOT add any other text, explanations, or quotation marks.
- If the circuit is simple, just name what you see (e.g., "AND-OR Logic").
- If the circuit is empty, respond with "Empty Circuit".`,

    /**
     * Finds all modal elements and hooks up all event listeners.
     */
    init: function() {
        console.log("Storage Manager initializing...");

        // --- Find Save Modal Elements ---
        this.saveModalBackdrop = document.getElementById('save-modal-backdrop');
        this.saveModal = document.getElementById('save-modal');
        this.saveNameInput = document.getElementById('save-circuit-name');
        // --- REMOVED: aiNameButton (it's automatic) ---
        this.aiNameLoading = document.getElementById('ai-name-loading');
        this.saveConfirmBtn = document.getElementById('save-modal-confirm-btn');
        const saveModalCloseBtn = document.getElementById('save-modal-close-btn');
        const saveModalCancelBtn = document.getElementById('save-modal-cancel-btn');
        const saveCircuitBtn = document.getElementById('save-circuit-btn');

        // --- Find Load Modal Elements ---
        this.loadModalBackdrop = document.getElementById('load-modal-backdrop');
        this.loadModal = document.getElementById('load-modal');
        this.loadList = document.getElementById('load-circuit-list');
        const loadModalCloseBtn = document.getElementById('load-modal-close-btn');
        const loadModalCancelBtn = document.getElementById('load-modal-cancel-btn');
        const loadCircuitBtn = document.getElementById('load-circuit-btn');

        // --- Hook up Toolbar Listeners ---
        saveCircuitBtn?.addEventListener('click', () => this.openSaveModal());
        loadCircuitBtn?.addEventListener('click', () => this.openLoadModal());

        // --- Hook up Save Modal Listeners ---
        saveModalCloseBtn?.addEventListener('click', () => this.closeSaveModal());
        saveModalCancelBtn?.addEventListener('click', () => this.closeSaveModal());
        this.saveModalBackdrop?.addEventListener('click', (e) => {
            if (e.target === this.saveModalBackdrop) this.closeSaveModal();
        });
        this.saveConfirmBtn?.addEventListener('click', () => this.handleSaveCircuit());
        // --- REMOVED: aiNameButton listener ---
        
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
    },

    // --- Modal Control ---

    /**
     * --- MODIFIED: Now automatically fetches AI name ---
     */
    openSaveModal: async function() {
        if (!this.saveModalBackdrop) return;
        
        // --- Show modal and loading state immediately ---
        this.saveNameInput.value = ''; // Clear old name
        this.saveNameInput.disabled = true;
        this.saveConfirmBtn.disabled = true;
        this.aiNameLoading.classList.remove('hidden');
        this.saveModalBackdrop.classList.remove('hidden');

        try {
            // --- Fetch the name automatically ---
            const suggestedName = await this.fetchAiName();
            if (suggestedName === "Empty Circuit") {
                 AnimationManager.logError("Cannot save an empty circuit.");
                 this.closeSaveModal();
                 return;
            }
            this.saveNameInput.value = suggestedName;
            this.saveNameInput.focus();

        } catch (error) {
            // Error is already logged by fetchAiName
            this.saveNameInput.value = 'My Circuit'; // Fallback name
        } finally {
            // --- Hide loading state ---
            this.saveNameInput.disabled = false;
            this.saveConfirmBtn.disabled = false;
            this.aiNameLoading.classList.add('hidden');
        }
    },
    
    closeSaveModal: function() {
        this.saveModalBackdrop?.classList.add('hidden');
    },
    
    openLoadModal: function() {
        if (!this.loadModalBackdrop) return;
        this.populateLoadModal();
        this.loadModalBackdrop.classList.remove('hidden');
    },

    closeLoadModal: function() {
        this.loadModalBackdrop?.classList.add('hidden');
    },

    // --- Core Storage Functions ---

    getSavedCircuits: function() {
        try {
            const saves = localStorage.getItem(this.STORAGE_KEY);
            return saves ? JSON.parse(saves) : {};
        } catch (e) {
            console.error("Error reading from localStorage:", e);
            return {};
        }
    },
    
    handleSaveCircuit: function() {
        const name = this.saveNameInput.value.trim();
        if (!name) {
             // Use a custom modal alert later, for now, browser alert
             alert("Please enter a circuit name."); 
            return;
        }

        try {
            // --- Use the new function from simulator.js ---
            const circuitData = Simulator.getCircuitData(); 
            if (!circuitData) {
                 alert("Could not get circuit data to save.");
                 return;
            }

            const allSaves = this.getSavedCircuits();
            allSaves[name] = {
                name: name,
                savedAt: new Date().toISOString(),
                data: circuitData
            };
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allSaves));
            AnimationManager.logStep(`Circuit saved as \`${name}\`.`);
            this.closeSaveModal();

        } catch (e) {
            console.error("Error saving circuit:", e);
            AnimationManager.logError(`Could not save circuit: ${e.message}`);
        }
    },
    
    handleLoadCircuit: function(name) {
        if (!name) return;
        
        // --- Use a simple confirm for now ---
        if (!confirm(`Are you sure you want to load "${name}"?\nYour current circuit will be replaced.`)) {
            return;
        }
        
        try {
            const allSaves = this.getSavedCircuits();
            const saveData = allSaves[name];

            if (!saveData || !saveData.data) {
                throw new Error("No data found for this circuit.");
            }
            
            // --- Use the new function from simulator.js ---
            Simulator.loadCircuitData(saveData.data); 
            
            this.closeLoadModal();
            AnimationManager.logStep(`Circuit \`${name}\` loaded successfully.`);
            AnimationManager.startSimulation(); 

        } catch (e) {
            console.error("Error loading circuit:", e);
            AnimationManager.logError(`Could not load circuit \`${name}\`: ${e.message}`);
        }
    },
    
    handleDeleteCircuit: function(name) {
        if (!name) return;
        
        if (!confirm(`Are you sure you want to delete "${name}"?\nThis action cannot be undone.`)) {
            return;
        }

        try {
            const allSaves = this.getSavedCircuits();
            if (allSaves[name]) {
                delete allSaves[name];
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allSaves));
                AnimationManager.logStep(`Circuit \`${name}\` deleted.`);
                this.populateLoadModal(); // Refresh the list
            }
        } catch (e) {
            console.error("Error deleting circuit:", e);
            AnimationManager.logError(`Could not delete circuit: ${e.message}`);
        }
    },

    populateLoadModal: function() {
        this.loadList.innerHTML = ''; // Clear existing list
        const allSaves = this.getSavedCircuits();
        const circuits = Object.values(allSaves);

        circuits.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        
        if (circuits.length === 0) {
            this.loadList.innerHTML = '<p style="padding: 20px; text-align: center;">No saved circuits found.</p>';
            return;
        }

        for (const circuit of circuits) {
            const item = document.createElement('div');
            item.className = 'load-item';
            item.dataset.name = circuit.name;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'load-item-name';
            nameSpan.textContent = circuit.name;
            
            const dateSpan = document.createElement('span');
            dateSpan.className = 'load-item-date';
            dateSpan.textContent = new Date(circuit.savedAt).toLocaleString();
            
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
        
        lucide.createIcons();
    },

    // --- AI Naming Function ---

    /**
     * --- MODIFIED: Now called automatically by openSaveModal ---
     * @returns {string} - The suggested name, or a fallback.
     */
    fetchAiName: async function() {
        try {
            const circuitData = Simulator.getCircuitData();
            if (!circuitData || (circuitData.components.length === 0 && circuitData.wires.length === 0)) {
                return "Empty Circuit"; // Special case
            }

            // --- Create a simpler summary for the AI prompt ---
            const circuitSummary = {
                components: circuitData.components.map(c => c.type), // Just send a list of types
                connections: circuitData.wires.length
            };

            // Limit summary size to avoid overly long prompts
            if (circuitSummary.components.length > 50) {
                 circuitSummary.components = circuitSummary.components.slice(0, 50);
                 circuitSummary.components.push("...and more");
            }

            const userQuery = `Analyze this circuit and provide a name: ${JSON.stringify(circuitSummary)}`;

            const apiKey = ""; // API key is injected
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: this.AI_NAME_SYSTEM_PROMPT }] },
                generationConfig: {
                    temperature: 0.1, 
                    maxOutputTokens: 50
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`AI API request failed with status ${response.status}`);
            }

            const result = await response.json();
            
            if (result.candidates && result.candidates[0].content?.parts?.[0]?.text) {
                const suggestedName = result.candidates[0].content.parts[0].text
                    .trim()
                    .replace(/["']/g, ''); // Clean up any quotes
                
                AnimationManager.logStep(`AI suggested a name: \`${suggestedName}\``);
                return suggestedName; // Return the name
            } else {
                throw new Error("AI did not return a valid name.");
            }

        } catch (error) {
            console.error("AI Naming Error:", error);
            AnimationManager.logError(`AI Naming failed: ${error.message}`);
            return "My Circuit"; // Return a fallback name
        }
    }
};

// --- *** BUG FIX *** ---
// The line below was causing a crash because it ran before the HTML was loaded.
// Main.init() now correctly calls this function at the right time.
// StorageManager.init(); // <-- REMOVED THIS LINE