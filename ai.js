// This file contains all logic for the AI Circuit Assistant

const AIManager = {
    // --- Configuration ---
    // Stricter prompt emphasizing required fields
    SYSTEM_PROMPT: `
You are an expert logic circuit designer inside a web simulator. Your ONLY goal is to help a user build a circuit by providing a step-by-step JSON plan.

**CRITICAL RULES:**
1.  You MUST respond with *only* a valid JSON array of "action" objects. No explanations, no introductory text, just the JSON array itself starting with '[' and ending with ']'.
2.  Each action object MUST contain a "command" field ("addComponent" or "addWire") and a "params" object.
3.  The "params" object for *every* command MUST contain ALL required fields specified below. Missing fields will break the simulator. Double-check your response.

**Canvas & Coordinates:**
- The canvas is roughly 800px wide and 600px high. (0,0) is the top-left corner.
- Place components with at least 100px of space between them.
- Place INPUTS on the far left (e.g., x=100) and OUTPUTS on the far right (e.g., x=700). Gates in the middle.

**Your Tools (JSON Format):**

1.  **addComponent**: Adds a component. **ALL PARAMS ARE REQUIRED.**
    -   **command**: MUST be "addComponent"
    -   **params**:
        -   **id**: REQUIRED. UNIQUE string ID (e.g., "A", "gate1").
        -   **type**: REQUIRED. Valid types: "INPUT", "OUTPUT", "AND", "OR", "NOT", "XOR", "NAND", "NOR", "XNOR". **YOU MUST PROVIDE THIS.**
        -   **x**: REQUIRED. Number (e.g., 100).
        -   **y**: REQUIRED. Number (e.g., 150).
        -   **label**: OPTIONAL. String. A custom name for the component (e.g., "Input A").

2.  **addWire**: Connects two components. **ALL PARAMS ARE REQUIRED.**
    -   **command**: MUST be "addWire"
    -   **params**:
        -   **from_id**: REQUIRED. String ID of the source component.
        -   **from_node**: REQUIRED. Must *always* be the string "out".
        -   **to_id**: REQUIRED. String ID of the destination component.
        -   **to_node**: REQUIRED. String: "in", "A", or "B".

**Example Request:** "Build an AND gate."
**Your ONLY Response (JSON array, ALL fields included):**
[
  { "command": "addComponent", "params": { "id": "A", "type": "INPUT", "x": 100, "y": 150, "label": "Input A" } },
  { "command": "addComponent", "params": { "id": "B", "type": "INPUT", "x": 100, "y": 250, "label": "Input B" } },
  { "command": "addComponent", "params": { "id": "and1", "type": "AND", "x": 300, "y": 200 } },
  { "command": "addComponent", "params": { "id": "out", "type": "OUTPUT", "x": 500, "y": 200, "label": "Output" } },
  { "command": "addWire", "params": { "from_id": "A", "from_node": "out", "to_id": "and1", "to_node": "A" } },
  { "command": "addWire", "params": { "from_id": "B", "from_node": "out", "to_id": "and1", "to_node": "B" } },
  { "command": "addWire", "params": { "from_id": "and1", "from_node": "out", "to_id": "out", "to_node": "in" } }
]

REMEMBER: ONLY provide the valid JSON array. Double-check that ALL required parameters (id, type, x, y, from_id, from_node, to_id, to_node) are included in every action. Your entire response must be ONLY the JSON.
`,

    // --- *** SCHEMA REMOVED *** ---
    // We will rely on the prompt and manual validation instead.

    // --- UI Elements ---
    modalBackdrop: null,
    chatHistory: null,
    promptInput: null,
    sendButton: null,
    loadingIndicator: null,
    errorText: null,

    // --- State ---
    chatMessages: [], // Stores the conversation history for the AI
    tempComponentMap: new Map(), // Stores AI IDs -> Real Component Objects

    /**
     * Initializes the AI Manager and hooks up all the UI elements.
     */
    init: function() {
        this.modalBackdrop = document.getElementById('ai-modal-backdrop');
        this.chatHistory = document.getElementById('ai-chat-history');
        this.promptInput = document.getElementById('ai-prompt-input');
        this.sendButton = document.getElementById('ai-send-btn');
        this.loadingIndicator = document.getElementById('ai-loading');
        this.errorText = document.getElementById('ai-error');
        const closeButton = document.getElementById('ai-close-btn');

        // Hook up listeners
        this.sendButton.addEventListener('click', () => this.sendAIPrompt());
        closeButton.addEventListener('click', () => this.hideModal());
        this.modalBackdrop.addEventListener('click', (e) => {
            // Close if clicked outside the modal content
            if (e.target === this.modalBackdrop) this.hideModal();
        });
        // Allow sending with Enter key in textarea, unless Shift is held
        this.promptInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent newline in textarea
                this.sendAIPrompt();
            }
        });
    },

    // --- UI Control ---
    showModal: function() {
        this.modalBackdrop.classList.remove('hidden');
        this.promptInput.focus();
        this.clearError(); // Clear old errors when opening
    },

    hideModal: function() {
        this.modalBackdrop.classList.add('hidden');
    },

    addMessageToChat: function(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${sender}`;
        // Basic Markdown-like formatting for newlines (more robust later if needed)
        messageDiv.innerHTML = text.replace(/\n/g, '<br>');
        this.chatHistory.appendChild(messageDiv);
        // Scroll to the bottom
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    },

    setLoading: function(isLoading) {
        this.loadingIndicator.classList.toggle('hidden', !isLoading);
        this.sendButton.disabled = isLoading;
        this.promptInput.disabled = isLoading; // Disable input while loading
    },

setError: function(message) {
        this.errorText.textContent = message;
        this.errorText.classList.remove('hidden');
    },

    clearError: function() {
        this.errorText.textContent = '';
        this.errorText.classList.add('hidden');
    },

    // --- API & Execution ---

    /**
     * Called when the user clicks "Send" or presses Enter
     */
    async sendAIPrompt() {
        const userPrompt = this.promptInput.value;
        if (!userPrompt.trim()) return; // Ignore empty prompts

        this.setLoading(true);
        this.clearError();
        this.addMessageToChat('user', userPrompt);
        this.promptInput.value = ''; // Clear input immediately
        // Add user message to context for the AI
        this.chatMessages.push({ role: "user", parts: [{ text: userPrompt }] });

        try {
            const apiKey = "AIzaSyD5tQg_ls50hZGVX24zGqGN0nDbHM1xsNE"; // API key is injected
            // Use flash model for speed and cost
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

            const payload = {
                contents: this.chatMessages,
                // Using the updated, stricter SYSTEM_PROMPT
                systemInstruction: { parts: [{ text: this.SYSTEM_PROMPT }] },
                // --- *** SCHEMA REMOVED *** ---
                generationConfig: {
                    // Still ask for JSON mime type, helps guide the model
                    responseMimeType: "application/json",
                    // Low temperature for more deterministic plans
                    temperature: 0.1
                }
            };

            // --- Exponential backoff retry logic ---
            let response;
            let retries = 0;
            const maxRetries = 3;
            let delay = 1000; // Start with 1 second

            while (retries < maxRetries) {
                console.log(`Attempt ${retries + 1} to call Gemini API...`);
                try {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        console.log("API call successful.");
                        break; // Success! Exit the loop
                    }

                    console.warn(`API call failed with status: ${response.status}`);
                    // Check for retryable HTTP status codes
                    if (response.status === 429 || response.status >= 500) {
                        // Wait and increase delay for retry
                    } else {
                        // Not a retryable error (e.g., 400 Bad Request)
                        // Try to get error message from response body
                        const errorData = await response.json();
                        throw new Error(errorData.error?.message || `HTTP error ${response.status}`);
                    }
                } catch (fetchError) {
                    console.error("Fetch error during API call attempt:", fetchError);
                    // If max retries reached, throw the last error
                    if (retries >= maxRetries - 1) throw fetchError;
                    // Otherwise, just wait for the next retry
                }

                // Increment retry count and wait before next attempt
                retries++;
                if (retries < maxRetries) {
                    console.log(`Retrying after ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Double the delay for next time
                }
            }
            // --- End of retry logic ---

            // Check if all retries failed
            if (!response || !response.ok) {
                let specificError = "the API request failed";
                if (response) {
                    specificError += ` (Status: ${response.status})`;
                    if (response.status === 400) {
                        // 400 often means API key issues or malformed request *before* schema check
                         specificError = "the request was invalid. Please check your API key and ensure it's enabled";
                    }
                } else {
                    specificError = "there might have been a network issue reaching the API";
                }
                throw new Error(`Sorry, ${specificError} after several tries.`);
            }

            // --- Process successful response ---
            const result = await response.json();

            // Check for valid response structure
            if (result.candidates && result.candidates[0].content?.parts?.[0]?.text) {
                const jsonText = result.candidates[0].content.parts[0].text;
                let actions;

                // --- *** MORE ROBUST PARSING AND VALIDATION *** ---
                try {
                     // 1. Clean the text response - sometimes models add markdown ```json ... ```
                     const cleanedJsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                     
                     // 2. Try to parse the cleaned JSON
                     actions = JSON.parse(cleanedJsonText);

                     // 3. Check if it's an array
                     if (!Array.isArray(actions)) {
                         throw new Error("The response wasn't a list (array) of steps.");
                     }

                     // 4. Validate the *structure* of each action more thoroughly
                     for (const action of actions) {
                         if (!action || typeof action !== 'object') throw new Error("A step in the plan wasn't a valid object.");
                         if (typeof action.command !== 'string' || !action.command) throw new Error("A step is missing the 'command' field.");
                         if (typeof action.params !== 'object' || action.params === null) throw new Error(`Step '${action.command}' is missing the 'params' object.`);

                         if (action.command === 'addComponent') {
                             if (typeof action.params.id !== 'string' || !action.params.id) throw new Error("addComponent is missing 'id'.");
                             if (typeof action.params.type !== 'string' || !action.params.type) throw new Error(`addComponent '${action.params.id}' is missing 'type'.`);
                             if (typeof action.params.x !== 'number') throw new Error(`addComponent '${action.params.id}' is missing 'x'.`);
                             if (typeof action.params.y !== 'number') throw new Error(`addComponent '${action.params.id}' is missing 'y'.`);
                             // Note: We don't validate 'label' because it's optional
                         } else if (action.command === 'addWire') {
                              if (typeof action.params.from_id !== 'string' || !action.params.from_id) throw new Error("addWire is missing 'from_id'.");
                              if (action.params.from_node !== 'out') throw new Error("addWire 'from_node' must be 'out'.");
                              if (typeof action.params.to_id !== 'string' || !action.params.to_id) throw new Error("addWire is missing 'to_id'.");
                              if (!['in', 'A', 'B'].includes(action.params.to_node)) throw new Error("addWire 'to_node' must be 'in', 'A', or 'B'.");
                         } else {
                              throw new Error(`Unknown command '${action.command}' found in the plan.`);
                         }
                     }
                     // If we get here, the plan *looks* structurally valid

                } catch (parseError) {
                    console.error("JSON Parsing/Validation Error:", parseError, "Raw text:", jsonText);
                    throw new Error(`Sorry, I couldn't quite understand the plan the AI gave me. It wasn't in the expected JSON format. (${parseError.message})`);
                }
                // --- ---

                // Add the AI's *parsed plan* (which might differ slightly from raw text) to chat history
                this.chatMessages.push({ role: "model", parts: [{ text: JSON.stringify(actions, null, 2) }] }); // Store pretty-printed valid JSON
                this.addMessageToChat('assistant', "Okay, looks like a plan! Let me start building that for you...");
                this.hideModal();
                await this.executePlan(actions); // Run the "robot"
            } else {
                // Handle cases where the response structure is unexpected or content is blocked
                let errorMsg = "Hmm, I didn't get a valid plan back from the AI.";
                if (result.candidates && result.candidates[0].finishReason === 'SAFETY') {
                    errorMsg = "Sorry, I can't build that. The request might have triggered a safety filter. Could you try rephrasing?";
                } else if (result.promptFeedback?.blockReason) {
                    errorMsg = `Sorry, your request was blocked before it even reached the AI. Reason: ${result.promptFeedback.blockReason}. Please try again differently.`;
                } else if (!result.candidates || result.candidates.length === 0) {
                     errorMsg = "The AI didn't provide any response content. This might be a temporary issue.";
                }
                console.error("AI Response Error:", result);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error("AI Error in sendAIPrompt:", error);
            this.setError(`Error: ${error.message}`);
            this.addMessageToChat('assistant', `Oh dear, something went wrong: ${error.message}`);
            // Remove the failed user prompt from history so we don't send it again
            if (this.chatMessages.length > 0 && this.chatMessages[this.chatMessages.length - 1].role === 'user') {
                this.chatMessages.pop();
            }
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * The "Robot" - executes the AI's plan step-by-step
     * @param {Array} actions - The array of actions from the AI
     */
    async executePlan(actions) {
        this.tempComponentMap.clear(); // Clear mapping from previous runs
        Simulator.resetSimulation(); // Clear the canvas and logs
        AnimationManager.logStep("Alright, AI is taking the wheel! Let's build this circuit...");

        if (!actions || actions.length === 0) {
            AnimationManager.log("The AI provided an empty plan. Nothing to build!");
            return;
        }

        for (const [index, action] of actions.entries()) {
             AnimationManager.log(`Step ${index + 1}/${actions.length}: ${action.command}...`);
             // Add a delay for the "animation" effect
            await new Promise(resolve => setTimeout(resolve, 300)); // 300ms per step

            try {
                // Basic validation (already done more thoroughly after fetch, but good backup)
                if (!action || typeof action !== 'object' || !action.command || !action.params) {
                    throw new Error("This step in the plan is invalid or incomplete.");
                }

                // Execute based on command
                if (action.command === 'addComponent') {
                    this.executeAddComponent(action.params);
                } else if (action.command === 'addWire') {
                    this.executeAddWire(action.params);
                } else {
                     // Should have been caught by validation, but just in case
                     throw new Error(`I encountered an unknown command: "${action.command}".`);
                }
            } catch (error) {
                console.error("AI Plan Execution Error:", error, "Action:", action);
                AnimationManager.logError(`Oops! Hit a snag during step ${index + 1}: ${error.message}. Stopping the build.`);
                // Show error in modal as well, in case it was hidden
                this.setError(`Build failed at step ${index + 1}: ${error.message}`);
                return; // Stop execution
            }
        }
        
        AnimationManager.logStep("AI build finished! Looks good. Let's run a quick simulation...");
        AnimationManager.startSimulation(); // Run simulation automatically after building
        Simulator.autoSaveCircuit(); // --- MODIFIED: Use autoSave ---
    },

    /**
     * Executes the 'addComponent' command from the AI plan.
     * @param {object} params - The parameters for the command.
     */
    executeAddComponent: function(params) {
        // Validation should have caught missing fields, but double-check type specifically
        if (!params || typeof params.type !== 'string' || !params.type.trim()) {
            throw new Error(`Missing or invalid component type for component ID '${params?.id || 'unknown'}'.`);
        }
        const componentType = params.type.trim().toUpperCase();
        const componentId = params.id.trim(); // Assume ID is valid from previous check

        if (this.tempComponentMap.has(componentId)) {
            throw new Error(`The AI tried to use the same name "${componentId}" for two different components.`);
        }
        if (typeof params.x !== 'number' || typeof params.y !== 'number') {
             throw new Error(`Missing coordinates for ${componentType} (ID: ${componentId}).`);
        }
        const x = params.x;
        const y = params.y;

        let newComponent;
        switch (componentType) {
            case 'INPUT': newComponent = new InputToggle(x, y); break;
            case 'OUTPUT': newComponent = new OutputLed(x, y); break;
            case 'AND': newComponent = new AndGate(x, y); break;
            case 'OR': newComponent = new OrGate(x, y); break;
            case 'NOT': newComponent = new NotGate(x, y); break;
            case 'XOR': newComponent = new XorGate(x, y); break;
            case 'NAND': newComponent = new NandGate(x, y); break;
            case 'NOR': newComponent = new NorGate(x, y); break;
            case 'XNOR': newComponent = new XnorGate(x, y); break;
            default:
                 throw new Error(`I don't know how to build a component called "${componentType}".`);
        }

        // --- NEW: Check for and set the custom label ---
        if (params.label && typeof params.label === 'string' && newComponent.setCustomLabel) {
            newComponent.setCustomLabel(params.label);
            AnimationManager.log(`   ...and labeling it: "${params.label}"`);
        }
        // ---

        Simulator.addComponent(newComponent);
        this.tempComponentMap.set(componentId, newComponent); // Store mapping: AI ID -> Actual Component
        AnimationManager.log(`   Placing a ${componentType} named "${componentId}"`);
    },

    /**
     * Executes the 'addWire' command from the AI plan.
     * @param {object} params - The parameters for the command.
     */
    executeAddWire: function(params) {
         // Assume params are valid from previous check
        const fromId = params.from_id.trim();
        const toId = params.to_id.trim();
        const fromNodeName = params.from_node.trim(); // Should be 'out'
        const toNodeName = params.to_node.trim(); // 'in', 'A', or 'B'

        const fromComponent = this.tempComponentMap.get(fromId);
        const toComponent = this.tempComponentMap.get(toId);

        if (!fromComponent) throw new Error(`Plan references component "${fromId}" before it was created.`);
        if (!toComponent) throw new Error(`Plan references component "${toId}" before it was created.`);
        
        // Find the specific nodes using labels/names
        const fromNode = fromComponent.outputNodes.find(n => n.label === fromNodeName);
        if (!fromNode) throw new Error(`Component "${fromId}" doesn't have an output named "${fromNodeName}".`);
        
        const toNode = toComponent.inputNodes.find(n => n.label === toNodeName);
        if (!toNode) throw new Error(`Component "${toId}" doesn't have an input named "${toNodeName}".`);

        const newWire = new Wire(fromNode, toNode);
        Simulator.addWire(newWire);
        AnimationManager.log(`   Connecting "${fromId}" output to "${toId}" input ${toNodeName}`);
    }
};