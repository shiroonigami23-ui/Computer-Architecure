// --- NEW FILE ---
// This file's only job is to handle all user input
// (mouse, touch, keyboard) and tell the main app what to do.

const InputHandler = {
    // --- State ---
    isDraggingComponent: false,
    isPanning: false,
    draggedComponent: null,
    
    dragStartWorldX: 0,
    dragStartWorldY: 0,
    panStartScreenX: 0,
    panStartScreenY: 0,
    panStartOffsetX: 0,
    panStartOffsetY: 0,
    
    lastMouseScreenX: 0, 
    lastMouseScreenY: 0,
    
    // --- References ---
    canvasWrapper: null,

    /**
     * Initializes the InputHandler and attaches all event listeners.
     */
    init: function() {
        this.canvasWrapper = document.getElementById('canvas-wrapper');
        if (!this.canvasWrapper) {
            console.error("InputHandler: Could not find #canvas-wrapper element.");
            return;
        }
        
        this.setupCanvasListeners();
        this.setupKeyboardListeners();
        console.log("Input Handler Initialized.");
    },
    
    // --- Listener Setup ---

    setupKeyboardListeners: function() {
        window.addEventListener('keydown', (e) => {
            // Stop shortcuts if user is typing in *any* modal or input
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                return;
            }
            if (e.target.closest('.modal-dialog') || e.target.closest('#ai-modal')) {
                 return;
            }
            
            const key = e.key.toUpperCase();
            let handled = true;

            switch (key) {
                // These call functions still in main.js
                case 'V': Main.setActiveTool('SELECT'); break;
                case 'W': Main.setActiveTool('WIRE'); break;
                case 'D':
                case 'DELETE':
                case 'BACKSPACE':
                    Main.setActiveTool('DELETE');
                    break;
                case 'A': AIManager.showModal(); break;
                case 'R': document.getElementById('reset-btn')?.click(); break;
                case 'I': Main.setActiveTool('INPUT'); break;
                case 'O': Main.setActiveTool('OUTPUT'); break;
                
                // --- Panning with spacebar ---
                case ' ':
                case 'SPACEBAR': // Some browsers use this
                    if (!this.isPanning) {
                        this.isPanning = true;
                        this.panStartScreenX = this.lastMouseScreenX;
                        this.panStartScreenY = this.lastMouseScreenY;
                        this.panStartOffsetX = CanvasRenderer.viewOffsetX;
                        this.panStartOffsetY = CanvasRenderer.viewOffsetY;
                        this.canvasWrapper.style.cursor = 'grabbing';
                    }
                    break;
                default:
                    handled = false; 
                    break;
            }

            if (handled) e.preventDefault(); 
        });
        
        window.addEventListener('keyup', (e) => {
             if (e.key === ' ' || e.key === 'Spacebar') {
                 if (this.isPanning) {
                     this.isPanning = false;
                     // We need to tell main.js to update the cursor
                     Main.updateHoverAndCursor(
                         CanvasRenderer.getWorldX(this.lastMouseScreenX), 
                         CanvasRenderer.getWorldY(this.lastMouseScreenY)
                     );
                 }
             }
        });
    },

    setupCanvasListeners: function() {
        // --- Mouse Events ---
        this.canvasWrapper.addEventListener('mousemove', this.handlePointerMove.bind(this));
        this.canvasWrapper.addEventListener('mousedown', this.handlePointerDown.bind(this));
        window.addEventListener('mouseup', this.handlePointerUp.bind(this)); // Use window for mouseup
        
        // --- Touch Events ---
        this.canvasWrapper.addEventListener('touchmove', this.handlePointerMove.bind(this), { passive: false });
        this.canvasWrapper.addEventListener('touchstart', this.handlePointerDown.bind(this), { passive: false });
        window.addEventListener('touchend', this.handlePointerUp.bind(this));
        window.addEventListener('touchcancel', this.handlePointerUp.bind(this));

        this.canvasWrapper.addEventListener('mouseleave', () => {
             Main.hoveredNode = null; 
             Main.updateCoordsDisplay(null, null); 
        });

        this.canvasWrapper.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    // --- Pointer Event Handlers (Mouse + Touch) ---

    getPointer: function(e) {
        if (e.touches && e.touches.length > 0) return e.touches[0];
        if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0];
        return e; // Assumes mouse event
    },

    handlePointerMove: function(e) {
        if (e.type === 'touchmove') e.preventDefault();
        
        const pointer = this.getPointer(e);
        this.lastMouseScreenX = pointer.clientX;
        this.lastMouseScreenY = pointer.clientY;
        
        const worldX = CanvasRenderer.getWorldX(this.lastMouseScreenX);
        const worldY = CanvasRenderer.getWorldY(this.lastMouseScreenY);

        if (this.isDraggingComponent && this.draggedComponent) {
            this.draggedComponent.x = Main.snapToGrid(worldX - this.dragStartWorldX);
            this.draggedComponent.y = Main.snapToGrid(worldY - this.dragStartWorldY);
        
        } else if (this.isPanning) {
            const dx = this.lastMouseScreenX - this.panStartScreenX;
            const dy = this.lastMouseScreenY - this.panStartScreenY;
            CanvasRenderer.setPan(this.panStartOffsetX + dx, this.panStartOffsetY + dy);
            
        } else {
            Main.updateHoverAndCursor(worldX, worldY);
        }
        
        Main.updateCoordsDisplay(worldX, worldY);
    },

    handlePointerDown: function(e) {
        if (e.type === 'touchstart' && e.touches.length === 1) {
            // This is complex, but it prevents "tap-to-pan" from breaking component taps
        } else if (e.type === 'touchstart') {
            // Handle multi-touch gestures later (e.g., pinch zoom)
            return;
        }

        const pointer = this.getPointer(e);
        this.lastMouseScreenX = pointer.clientX;
        this.lastMouseScreenY = pointer.clientY;
        
        if (e.target.closest('.modal-dialog') || e.target.closest('#ai-modal') || e.target.closest('#properties-popup')) {
             return; 
        }
        
        const worldX = CanvasRenderer.getWorldX(this.lastMouseScreenX);
        const worldY = CanvasRenderer.getWorldY(this.lastMouseScreenY);
        const clickedObject = Simulator.getObjectAt(worldX, worldY);
        
        let isPlacingComponent = false;

        // Check for left-click or touch event
        if (e.type === 'touchstart' || e.button === 0) {
            
            // --- This logic calls back to Main ---
            
            if (Main.currentTool === 'SELECT') {
                 if (clickedObject && (clickedObject instanceof BaseGate)) {
                    Main.setSelectedComponent(clickedObject); 
                 } else {
                     Main.setSelectedComponent(null); 
                 }
            } else if (Main.currentTool === 'WIRE' || Main.currentTool === 'DELETE') {
                 Main.setSelectedComponent(null); 
            }

            switch (Main.currentTool) {
                case 'SELECT':
                    if (clickedObject) {
                        if (clickedObject instanceof Node) {
                            if (clickedObject.type === 'output') {
                                Main.handleWireStart(clickedObject); 
                            } else {
                                Main.updateStatus("Wires must start from an output.");
                            }
                        } else if (clickedObject instanceof InputToggle) {
                            Simulator.toggleInput(clickedObject);
                            AnimationManager.startSimulation(); 
                            Simulator.autoSaveCircuit(); 
                        } else if (clickedObject instanceof BaseGate) {
                            const clickRelX = worldX - clickedObject.x;
                            if (clickRelX > clickedObject.width / 2) {
                                const startNode = clickedObject.getDefaultOutputNode();
                                if (startNode) {
                                    Main.handleWireStart(startNode);
                                    break; 
                                }
                            }
                            
                            this.isDraggingComponent = true;
                            this.draggedComponent = clickedObject;
                            this.dragStartWorldX = worldX - clickedObject.x;
                            this.dragStartWorldY = worldY - clickedObject.y;
                            this.canvasWrapper.style.cursor = 'grabbing';
                        }
                    } else {
                        // Start Panning
                        this.isPanning = true;
                        this.panStartScreenX = this.lastMouseScreenX;
                        this.panStartScreenY = this.lastMouseScreenY;
                        this.panStartOffsetX = CanvasRenderer.viewOffsetX;
                        this.panStartOffsetY = CanvasRenderer.viewOffsetY;
                        this.canvasWrapper.style.cursor = 'grabbing';
                    }
                    break;

                case 'WIRE': 
                    if (Main.wireStartNode) { 
                        let targetNode = null;
                        if (clickedObject && clickedObject instanceof Node) {
                            targetNode = clickedObject;
                        } else if (clickedObject && clickedObject instanceof BaseGate) {
                            if (clickedObject !== Main.wireStartNode.parentComponent) {
                                targetNode = clickedObject.getAvailableInputNode();
                                if (!targetNode) Main.updateStatus("This component has no available inputs.");
                            }
                        }

                        if (targetNode) {
                            if (targetNode.type === 'input' && targetNode.parentComponent !== Main.wireStartNode.parentComponent) {
                                Main.handleWireEnd(targetNode); 
                            } else {
                                Main.wireStartNode = null; 
                                Main.updateStatus("Wiring canceled: Invalid connection.");
                            }
                        } else if (!clickedObject) {
                            Main.wireStartNode = null; 
                            Main.updateStatus("Wiring canceled.");
                        }
                    } else { 
                        let startNode = null;
                        if (clickedObject && clickedObject instanceof Node) {
                            startNode = clickedObject;
                        } else if (clickedObject && clickedObject instanceof BaseGate) {
                            startNode = clickedObject.getDefaultOutputNode();
                        }

                        if (startNode) {
                            if (startNode.type === 'output') {
                                Main.handleWireStart(startNode); 
                            } else {
                                Main.updateStatus("Wires must start from an output (right side).");
                            }
                        }
                    }
                    break;

                case 'DELETE':
                    if (clickedObject && clickedObject instanceof Node) {
                        Simulator.deleteWiresForNode(clickedObject);
                        AnimationManager.startSimulation();
                        Simulator.autoSaveCircuit(); 
                    } else if (clickedObject && clickedObject instanceof BaseGate) {
                        if (clickedObject === Main.selectedComponent) Main.setSelectedComponent(null); 
                        Simulator.deleteComponent(clickedObject);
                        AnimationManager.startSimulation();
                        Simulator.autoSaveCircuit();
                    }
                    break;
                
                // --- Component Placement ---
                // This block creates the component, but Main handles setting the tool
                default:
                    const newComponent = Main.createComponent(Main.currentTool, worldX, worldY);
                    if (newComponent) {
                         Simulator.addComponent(newComponent); 
                         Main.setSelectedComponent(newComponent);
                         isPlacingComponent = true;
                         
                         Main.setActiveTool('SELECT'); // Switch back
                         AnimationManager.startSimulation(); 
                         Simulator.autoSaveCircuit(); 
                    }
                    break;
            }
        }
    },

    handlePointerUp: function(e) {
        const worldX = CanvasRenderer.getWorldX(this.lastMouseScreenX);
        const worldY = CanvasRenderer.getWorldY(this.lastMouseScreenY);

        if (this.isDraggingComponent && (e.type.startsWith('touch') || e.button === 0)) {
            if(this.draggedComponent) {
                // Final snap
                this.draggedComponent.x = Main.snapToGrid(worldX - this.dragStartWorldX);
                this.draggedComponent.y = Main.snapToGrid(worldY - this.dragStartWorldY);

                AnimationManager.startSimulation(); 
                Simulator.autoSaveCircuit();
            }
            this.isDraggingComponent = false;
            this.draggedComponent = null;
        }
        
        if (this.isPanning) {
            this.isPanning = false;
        }
        
        Main.updateHoverAndCursor(worldX, worldY);
    }
};

