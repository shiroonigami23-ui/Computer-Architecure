// --- REFACTORED ---
// This file is now the "Main" controller.
// It holds application state and core logic, but does NOT handle input.
// InputHandler.js calls the functions in this file.

const Main = {
    // --- 1. Application State ---
    currentTool: 'SELECT',
    selectedComponent: null,
    wireStartNode: null, 
    hoveredNode: null, 
    
    // --- UI References ---
    canvas: null,
    canvasWrapper: null,
    coordsDisplay: null,
    propertiesPopup: null,

    GRID_SIZE: 20, 

    // --- 2. Main Initialization ---
    // --- MODIFIED: This is now called by AuthManager.launchApp() ---
    init: function() {
        console.log("Web-Logisim initializing...");

        this.canvas = document.getElementById('simulation-canvas');
        this.canvasWrapper = document.getElementById('canvas-wrapper');
        this.propertiesPopup = document.getElementById('properties-popup');
        this.coordsDisplay = document.getElementById('coords-display');

        if (!this.canvas || !this.canvasWrapper || !this.propertiesPopup) {
            console.error("CRITICAL ERROR: Canvas, Wrapper, or Popup element(s) not found.");
            return;
        }
        
        // --- Initialize all managers ---
        // *** MODIFIED: AuthManager is ALREADY initialized ***
        StorageManager.init();
        CanvasRenderer.init(this.canvas); 
        AIManager.init(); 
        AnimationManager.init(); // This will clear and show the "Ready" log
        InputHandler.init(); 

        // --- Setup (non-input) listeners ---
        this.setupToolbarListeners();
        this.setupRunButtonListeners(); 
        this.setupExportButton(); 
        
        // --- Setup collapsibles ---
        document.querySelectorAll('.tool-section').forEach((section, index) => {
            if (index !== 0) { 
                 section.classList.add('collapsed');
            } else {
                 const content = section.querySelector('.tool-section-content');
                 if(content) {
                    // Set initial max-height for smooth load
                    setTimeout(() => content.style.maxHeight = content.scrollHeight + "px", 0);
                 }
            }
        });

        // --- Load auto-save circuit (this is localStorage, will be replaced by cloud) ---
        const loaded = Simulator.loadAutoSaveCircuit();
        if (loaded) {
            this.updateStatus("Loaded local auto-saved circuit.");
        } else {
            // --- MODIFIED: More generic ready message ---
            this.updateStatus("Ready. Select a tool or ask the AI.");
        }

        this.mainLoop(); 
        AnimationManager.startSimulation();
        
        // --- *** ICON FIX: MOVED HERE *** ---
        // This runs *after* Main.init() is complete and the app is visible
        // This is safe because the bootloader already checked that lucide is loaded
        setTimeout(() => {
            try {
                console.log("Attempting to create app icons...");
                if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
                    lucide.createIcons();
                    console.log("App icons created successfully.");
                } else {
                    throw new Error("lucide.createIcons is not available.");
                }
            } catch (iconError) {
                console.error("Failed to create app icons.", iconError);
                AnimationManager.logError("Warning: Could not load app icons.");
            }
        }, 100); // 100ms delay to let the app render
        // --- *** END ICON FIX *** ---
    },

    /**
     * The main animation loop. Handles drawing only.
     */
    mainLoop: function() {
        // --- Pass input state to renderer ---
        CanvasRenderer.draw(
            this.selectedComponent, 
            this.wireStartNode, 
            InputHandler.lastMouseScreenX, 
            InputHandler.lastMouseScreenY, 
            InputHandler.isPanning
        );

        // Draw the "ghost wire" if needed
        if (this.currentTool === 'WIRE' && this.wireStartNode) {
            this.drawGhostWire();
        }
        
        // Update properties panel position *if* it's open (handles panning)
        if (this.selectedComponent && this.propertiesPopup.classList.contains('visible')) {
            this.updatePropertiesPanelPosition();
        }

        // Use 'this' context for requestAnimationFrame
        requestAnimationFrame(this.mainLoop.bind(this));
    },

    // --- 3. Event Listener Setup (Refactored) ---
    
    setupToolbarListeners: function() {
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) return;

        toolbar.addEventListener('click', (e) => {
            const toolButton = e.target.closest('.tool-button');
            const header = e.target.closest('.collapsible-header');

            if (toolButton) { 
                const toolName = toolButton.dataset.tool;
                if (!toolName) return;

                if (toolName === 'AI') {
                    AIManager.showModal();
                    return;
                }
                if (toolName === 'SAVE' || toolName === 'LOAD' || toolName === 'AUTH') {
                     // Handled by StorageManager/AuthManager, which have their own listeners
                     return;
                }
                
                this.setActiveTool(toolName); 

            } else if (header) { 
                const section = header.closest('.tool-section');
                if (!section) return;

                section.classList.toggle('collapsed');
                const icon = header.querySelector('.collapse-icon');
                const content = section.querySelector('.tool-section-content');

                if (section.classList.contains('collapsed')) {
                     if(icon) icon.textContent = '▶'; 
                     if(content) content.style.maxHeight = '0px';
                } else {
                     if(icon) icon.textContent = '▼'; 
                     if(content) content.style.maxHeight = content.scrollHeight + "px";
                }
            }
        });
    },

    setupRunButtonListeners: function() {
        const resetBtn = document.getElementById('reset-btn');
        resetBtn?.addEventListener('click', () => {
            // --- Use confirm to prevent accidental reset ---
            if (!confirm("Are you sure you want to clear the canvas?")) {
                return;
            }
            Simulator.resetSimulation(); 
            this.updateStatus('Simulation Reset. Select a tool.');
            this.setSelectedComponent(null); 
            this.wireStartNode = null; 
            AnimationManager.startSimulation();
            Simulator.autoSaveCircuit();
        });
    },

    setupExportButton: function() {
         const exportBtn = document.getElementById('export-png-btn');
         exportBtn?.addEventListener('click', () => {
              this.exportCanvasAsPNG();
         });
    },
    
    // --- 4. Core Logic Functions (Called by InputHandler) ---
    
    /**
     * Creates a new component instance based on the tool name.
     * @param {string} toolName - The name of the tool (e.g., 'AND', 'INPUT')
     * @param {number} worldX - The world X coordinate
     * @param {number} worldY - The world Y coordinate
     * @returns {BaseGate|null} A new component instance or null
     */
    createComponent: function(toolName, worldX, worldY) {
        const x = this.snapToGrid(worldX);
        const y = this.snapToGrid(worldY);
        
        switch (toolName) {
            case 'INPUT': return new InputToggle(x - 20, y - 20);
            case 'OUTPUT': return new OutputLed(x - 20, y - 20);
            case 'AND': return new AndGate(x - 60, y - 30);
            case 'OR': return new OrGate(x - 60, y - 30);
            case 'NOT': return new NotGate(x - 40, y - 30);
            case 'XOR': return new XorGate(x - 60, y - 30);
            case 'NAND': return new NandGate(x - 60, y - 30);
            case 'NOR': return new NorGate(x - 60, y - 30);
            case 'XNOR': return new XnorGate(x - 60, y - 30);
            default: return null; // Not a component tool
        }
    },

    // --- 5. UI Update Functions ---

    setActiveTool: function(toolName) {
        const toolButton = document.querySelector(`.tool-button[data-tool="${toolName}"]`);
        if (!toolButton) return;
        
        this.currentTool = toolName;
        document.querySelectorAll('.tool-button').forEach(t => t.classList.remove('active'));
        toolButton.classList.add('active');
        
        // --- NEW: Logic for properties tool ---
        if (toolName === 'PROPERTIES') {
            if (this.selectedComponent) {
                // If we select the tool and already have a component selected, show popup
                this.updatePropertiesPanel();
            } else {
                // If we select the tool and have nothing selected, hide old popup
                this.setSelectedComponent(null); 
                this.updateStatus("Properties: Select a component to edit.");
            }
        } else {
             // If we select any *other* tool, always hide the popup
             this.setSelectedComponent(null); 
        }
        // --- ---

        this.wireStartNode = null; 
        this.updateStatus(`Tool selected: ${toolName}`);
        this.updateHoverAndCursor(
            CanvasRenderer.getWorldX(InputHandler.lastMouseScreenX), 
            CanvasRenderer.getWorldY(InputHandler.lastMouseScreenY)
        ); 
    },

    setSelectedComponent: function(component) {
        // --- MODIFIED: Only show popup if Properties tool is active ---
        if (this.selectedComponent === component) {
             // If we're re-selecting the same component...
             if (this.currentTool === 'PROPERTIES') {
                 this.updatePropertiesPanel(); // Show it
             }
             return; 
        }
        
        this.selectedComponent = component;
        
        if (this.currentTool === 'PROPERTIES') {
            this.updatePropertiesPanel(); // Show for new component
        } else {
             this.propertiesPopup.classList.remove('visible'); // Hide for all other tools
        }
        // --- ---
    },

    updateStatus: function(text) {
        const statusTextElement = document.getElementById('status-text');
        if (statusTextElement) {
            statusTextElement.textContent = text;
        }
    },

    updateCoordsDisplay: function(x, y) {
        if (this.coordsDisplay) {
            if (x === null || y === null) {
                this.coordsDisplay.textContent = ""; 
            } else {
                this.coordsDisplay.textContent = `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
            }
        }
    },

    updateHoverAndCursor: function(worldX, worldY) {
        if (InputHandler.isDraggingComponent || InputHandler.isPanning) {
            this.canvasWrapper.style.cursor = 'grabbing';
            return;
        }

        const objectAtMouse = Simulator.getObjectAt(worldX, worldY);
        this.hoveredNode = null; 
        let cursorStyle = 'default'; 

        if (this.currentTool === 'SELECT') {
            if (objectAtMouse instanceof Node) {
                 cursorStyle = 'pointer'; 
                 if (objectAtMouse.type === 'output') this.hoveredNode = objectAtMouse;
            } else if (objectAtMouse instanceof InputToggle) {
                 cursorStyle = 'pointer'; 
            } else if (objectAtMouse instanceof BaseGate) {
                 const clickRelX = worldX - objectAtMouse.x;
                 if (clickRelX > objectAtMouse.width / 2 && objectAtMouse.getDefaultOutputNode()) {
                     cursorStyle = 'pointer'; 
                 } else {
                     cursorStyle = 'move'; 
                 }
            } else {
                 cursorStyle = 'grab'; 
            }
        } else if (this.currentTool === 'WIRE') {
             cursorStyle = 'crosshair';
             if (objectAtMouse instanceof Node) {
                 if (this.wireStartNode) { 
                     if (objectAtMouse.type === 'input' && objectAtMouse.parentComponent !== this.wireStartNode.parentComponent) {
                         this.hoveredNode = objectAtMouse;
                         cursorStyle = 'pointer'; 
                     } else {
                         cursorStyle = 'not-allowed';
                     }
                 } else { 
                     if (objectAtMouse.type === 'output') {
                         this.hoveredNode = objectAtMouse;
                         cursorStyle = 'pointer';
                     } else {
                         cursorStyle = 'not-allowed';
                     }
                 }
             } else if (objectAtMouse instanceof BaseGate) {
                if (this.wireStartNode) { 
                    if (objectAtMouse.getAvailableInputNode() && objectAtMouse !== this.wireStartNode.parentComponent) {
                        cursorStyle = 'pointer';
                    } else {
                        cursorStyle = 'not-allowed';
                    }
                } else { 
                    if (objectAtMouse.getDefaultOutputNode()) {
                        cursorStyle = 'pointer';
                    } else {
                        cursorStyle = 'not-allowed';
                    }
                }
             }
        } else if (this.currentTool === 'DELETE') {
             if (objectAtMouse instanceof BaseGate || objectAtMouse instanceof Node) {
                 cursorStyle = 'not-allowed'; 
             } else {
                  cursorStyle = 'default';
             }
        // --- NEW: Cursor for properties tool ---
        } else if (this.currentTool === 'PROPERTIES') {
            if (objectAtMouse instanceof BaseGate) {
                 cursorStyle = 'pointer';
            } else {
                 cursorStyle = 'default';
            }
        // --- ---
        } else { // Component placement tools
             cursorStyle = 'crosshair';
        }

        this.canvasWrapper.style.cursor = cursorStyle;
    },

    // --- 6. Action Handlers ---

    snapToGrid: function(value) {
        return Math.round(value / this.GRID_SIZE) * this.GRID_SIZE;
    },

    handleWireStart: function(node) {
        if (node === this.wireStartNode) {
            this.wireStartNode = null;
            this.updateStatus("Wiring canceled. Select an output node to start.");
            return;
        }

        if (node.type === 'output') {
            this.wireStartNode = node; 
            if (this.currentTool !== 'WIRE') this.setActiveTool('WIRE');
            this.canvasWrapper.style.cursor = 'crosshair';
            this.updateStatus("Drawing wire: Click on an input node to connect.");
        } else {
            this.updateStatus("Wire can only start from an OUTPUT node.");
        }
    },

    handleWireEnd: function(node) {
        const newWire = new Wire(this.wireStartNode, node);
        Simulator.addWire(newWire);
        AnimationManager.startSimulation();
        Simulator.autoSaveCircuit();
        
        this.wireStartNode = null; 
        this.hoveredNode = null;
        this.canvasWrapper.style.cursor = 'crosshair'; 
        this.updateStatus("Wire connected. Continue wiring or select another tool.");
    },

    drawGhostWire: function() {
        if (!CanvasRenderer.ctx || !this.wireStartNode) return;
        
        const worldX = CanvasRenderer.getWorldX(InputHandler.lastMouseScreenX);
        const worldY = CanvasRenderer.getWorldY(InputHandler.lastMouseScreenY);

        const startX = this.wireStartNode.parentComponent.x + this.wireStartNode.relX;
        const startY = this.wireStartNode.parentComponent.y + this.wireStartNode.relY;

        let endX = worldX;
        let endY = worldY;
        
        const objectAtMouse = Simulator.getObjectAt(worldX, worldY);

        if (this.hoveredNode && this.currentTool === 'WIRE') {
            endX = this.hoveredNode.parentComponent.x + this.hoveredNode.relX;
            endY = this.hoveredNode.parentComponent.y + this.hoveredNode.relY;
        } else if (objectAtMouse && objectAtMouse instanceof BaseGate && this.currentTool === 'WIRE') {
            const targetNode = objectAtMouse.getAvailableInputNode();
            if (targetNode && objectAtMouse !== this.wireStartNode.parentComponent) {
                endX = targetNode.parentComponent.x + targetNode.relX;
                endY = targetNode.parentComponent.y + targetNode.relY;
            }
        }

        CanvasRenderer.drawGhostWire(startX, startY, endX, endY);
    },

    // --- 7. Export Functionality ---
    exportCanvasAsPNG: function() {
        AnimationManager.logStep("Exporting canvas as PNG...");
        try {
            if (Simulator.allComponents.length === 0) {
                AnimationManager.logError("Export failed: Canvas is empty.");
                return;
            }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const padding = 50; 

            Simulator.allComponents.forEach(comp => {
                minX = Math.min(minX, comp.x);
                minY = Math.min(minY, comp.y);
                maxX = Math.max(maxX, comp.x + comp.width);
                maxY = Math.max(maxY, comp.y + comp.height);
            });
            
            Simulator.allComponents.forEach(comp => {
                 if (comp.customLabel) {
                      minY = Math.min(minY, comp.y - 20); 
                 }
            });

            const circuitWidth = Math.max(300, maxX - minX + padding * 2);
            const circuitHeight = Math.max(150, maxY - minY + padding * 2);
            const offsetX = -minX + padding; 
            const offsetY = -minY + padding;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = circuitWidth;
            tempCanvas.height = circuitHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            if (!tempCtx) throw new Error("Could not create temporary canvas context.");

            tempCtx.fillStyle = 'white'; 
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            CanvasRenderer.drawForExport(tempCtx, offsetX, offsetY);

            const dataURL = tempCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = 'logic_circuit.png';
            link.href = dataURL;
            link.click();
            AnimationManager.logStep("PNG export initiated.");

        } catch (error) {
            console.error("Error exporting PNG:", error);
            AnimationManager.logError(`Export failed: ${error.message}`);
        }
    },

    // --- 8. Properties Panel Functions ---

    updatePropertiesPanelPosition: function() {
        if (!this.selectedComponent) return; 
        
        const padding = 20; 
        const wrapperRect = this.canvasWrapper.getBoundingClientRect();
        
        const screenX = CanvasRenderer.getScreenX(this.selectedComponent.x);
        const screenY = CanvasRenderer.getScreenY(this.selectedComponent.y);
        const screenWidth = this.selectedComponent.width; 

        const popupWidth = this.propertiesPopup.offsetWidth || 220; 
        const popupHeight = this.propertiesPopup.offsetHeight || 100;

        let popupX = screenX + screenWidth + padding;
        let popupY = screenY;

        if (popupX + popupWidth > wrapperRect.width - 10) { 
            popupX = screenX - padding - popupWidth;
        }
         if (popupX < 10) { 
            popupX = 10;
        }
        if (popupY + popupHeight > wrapperRect.height - 10) {
            popupY = (wrapperRect.height - 10 - popupHeight);
        }
        if (popupY < 10) {
            popupY = 10;
        }
       this.propertiesPopup.style.left = `${popupX}px`;
        this.propertiesPopup.style.top = `${popupY}px`;
    },

    updatePropertiesPanel: function() {
        if (!this.selectedComponent) {
            this.propertiesPopup.classList.remove('visible');
            return;
        }

        this.propertiesPopup.innerHTML = ''; 
        const props = this.selectedComponent.getProperties();
        if (props.length === 0) {
            this.propertiesPopup.classList.remove('visible');
            return; 
        }

        props.forEach(prop => {
            const row = document.createElement('div');
            row.className = 'prop-row';
            
            const label = document.createElement('label');
            label.setAttribute('for', `prop-${prop.name}`);
            label.textContent = prop.name; 
            row.appendChild(label);

            const setterName = 'set' + prop.prop.charAt(0).toUpperCase() + prop.prop.slice(1);
            const setterFunction = this.selectedComponent[setterName];

            if (typeof setterFunction !== 'function') {
                console.error(`Component ${this.selectedComponent.label} is missing setter function ${setterName}`);
                return; 
            }

            if (prop.type === 'text') {
                const input = document.createElement('input');
                input.type = 'text';
                input.id = `prop-${prop.name}`;
                input.value = prop.value;
                input.addEventListener('input', (e) => { 
                    setterFunction.call(this.selectedComponent, e.target.value);
                    Simulator.autoSaveCircuit();
                });
                row.appendChild(input);
            } else if (prop.type === 'select') {
                const select = document.createElement('select');
                select.id = `prop-${prop.name}`;
                prop.options.forEach(optValue => { 
                    const option = document.createElement('option');
                    option.value = optValue;
                    option.textContent = optValue; 
                    if (optValue == prop.value) { 
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
                select.addEventListener('change', (e) => {
                    setterFunction.call(this.selectedComponent, e.target.value);
                    AnimationManager.startSimulation(); 
                    Simulator.autoSaveCircuit();
                });
                row.appendChild(select);
            }
            
            this.propertiesPopup.appendChild(row);
        });
        
        this.updatePropertiesPanelPosition();
        this.propertiesPopup.classList.add('visible');
    }
};

// --- Global Entry Point ---
// --- MODIFIED: This is no longer the main entry point ---
// The bootloader in index.html handles this.
