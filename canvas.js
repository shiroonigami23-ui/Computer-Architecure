// This file handles all the drawing logic for the canvas.
// --- *** MODIFICATION: VIRTUAL CAMERA *** ---
// The canvas element now fits the screen for high performance.
// We draw onto it using a "camera" (viewOffset) that pans over a large "world".

const CanvasRenderer = {
    canvas: null,
    ctx: null,
    wrapper: null, 
    
    // --- *** MODIFICATION: World size is now virtual *** ---
    WORLD_WIDTH: 10000,
    WORLD_HEIGHT: 8000,

    // --- *** NEW: The virtual "camera" position *** ---
    viewOffsetX: 0, 
    viewOffsetY: 0,
    
    // --- NEW: ResizeObserver to handle screen size changes ---
    resizeObserver: null,

    // --- Constants ---
    COLOR_GRID: '#f0f0f0',
    COLOR_COMPONENT_FILL: '#ffffff',
    COLOR_COMPONENT_BORDER: '#888888',
    COLOR_COMPONENT_LABEL: '#333333',
    COLOR_NODE_LABEL: '#666666', 
    COLOR_NODE: '#007bff',
    COLOR_NODE_HIGHLIGHT: 'rgba(0, 123, 255, 0.4)', 
    COLOR_WIRE_LOW: '#555555',
    COLOR_WIRE_HIGH: '#28a745',
    COLOR_LED_OFF: '#e0e0e0',
    COLOR_LED_ON: '#ffc107',
    COLOR_INPUT_OFF: '#f8f9fa',
    COLOR_INPUT_ON: '#e6f7ff',
    COLOR_SELECTION: 'rgba(0, 123, 255, 0.3)',
    COLOR_SELECTION_BORDER: 'rgba(0, 123, 255, 0.8)',
    COLOR_PULSE: '#ffc107',
    
    NODE_RADIUS: 6,
    GRID_SIZE: 20,

    // --- 1. Initialization ---
    init: function(canvasEl) {
        this.canvas = canvasEl;
        this.ctx = this.canvas.getContext('2d');
        this.wrapper = document.getElementById('canvas-wrapper');
        
        // --- *** MODIFICATION: Set initial size and watch for changes *** ---
        this.setCanvasSize(); 
        
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => {
                this.setCanvasSize();
            });
            this.resizeObserver.observe(this.wrapper);
        } else {
            // Fallback for older browsers
            window.addEventListener('resize', () => this.setCanvasSize());
        }
    },

    /**
     * --- *** MODIFIED: Set Canvas to fit the wrapper *** ---
     * This makes rendering much, much faster.
     */
    setCanvasSize: function() {
        if (!this.wrapper) return;
        
        // --- FIX: Ensure canvas has a size even if wrapper is 0x0 briefly ---
        const width = this.wrapper.clientWidth || 300;
        const height = this.wrapper.clientHeight || 150;
        
        this.canvas.width = width;
        this.canvas.height = height;
        console.log(`Canvas resized to: ${this.canvas.width} x ${this.canvas.height}`);
        
        // --- NEW: Re-draw immediately on resize ---
        // This fixes blank canvas on initial load or resize
        if (typeof Main !== 'undefined' && Main.mainLoop) {
             Main.mainLoop();
        }
    },

    // --- *** 2. NEW: Coordinate & Pan Helpers *** ---
    // These functions were missing and are called by input_handler.js and main.js

    /**
     * Converts a screen X coordinate (from a mouse event) to a world X coordinate.
     * @param {number} screenX - The pointer.clientX
     * @returns {number} The X coordinate in the virtual "world"
     */
    getWorldX: function(screenX) {
        if (!this.wrapper) return screenX;
        const rect = this.wrapper.getBoundingClientRect();
        return (screenX - rect.left) - this.viewOffsetX;
    },

    /**
     * Converts a screen Y coordinate (from a mouse event) to a world Y coordinate.
     * @param {number} screenY - The pointer.clientY
     * @returns {number} The Y coordinate in the virtual "world"
     */
    getWorldY: function(screenY) {
        if (!this.wrapper) return screenY;
        const rect = this.wrapper.getBoundingClientRect();
        return (screenY - rect.top) - this.viewOffsetY;
    },
    
    /**
     * Converts a world X coordinate to a screen X coordinate (relative to the wrapper).
     * @param {number} worldX - The component.x
     * @returns {number} The X coordinate relative to the canvas wrapper
     */
    getScreenX: function(worldX) {
        return worldX + this.viewOffsetX;
    },
    
    /**
     * Converts a world Y coordinate to a screen Y coordinate (relative to the wrapper).
     * @param {number} worldY - The component.y
     * @returns {number} The Y coordinate relative to the canvas wrapper
     */
    getScreenY: function(worldY) {
        return worldY + this.viewOffsetY;
    },

    /**
     * Sets the camera's pan (view offset) and clamps it within world bounds.
     * @param {number} newOffsetX - The new desired X offset
     * @param {number} newOffsetY - The new desired Y offset
     */
    setPan: function(newOffsetX, newOffsetY) {
        // Clamp X offset
        const minOffsetX = this.canvas.width - this.WORLD_WIDTH; // e.g., 800 - 10000 = -9200
        this.viewOffsetX = Math.max(minOffsetX, Math.min(0, newOffsetX));
        
        // Clamp Y offset
        const minOffsetY = this.canvas.height - this.WORLD_HEIGHT;
        this.viewOffsetY = Math.max(minOffsetY, Math.min(0, newOffsetY));
    },

    /**
     * Draws the "ghost wire" when the user is in wiring mode.
     * @param {number} startX - World X
     * @param {number} startY - World Y
     * @param {number} endX - World X
     * @param {number} endY - World Y
     */
    drawGhostWire: function(startX, startY, endX, endY) {
        const ctx = this.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        
        // Use the same C-curve as a real wire
        const midX = startX + (endX - startX) / 2;
        ctx.bezierCurveTo(midX, startY, midX, endY, endX, endY);
        
        ctx.strokeStyle = this.COLOR_NODE;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
    },
    
    /**
     * Draws the circuit onto a temporary canvas for PNG export.
     * @param {CanvasRenderingContext2D} tempCtx - The context of the export canvas
     * @param {number} offsetX - The X offset to apply to all components
     * @param {number} offsetY - The Y offset to apply to all components
     */
    drawForExport: function(tempCtx, offsetX, offsetY) {
        // Temporarily override this.ctx to draw on the export canvas
        const originalCtx = this.ctx;
        this.ctx = tempCtx; // Switch context
        
        this.ctx.save();
        this.ctx.translate(offsetX, offsetY);
        
        // Draw everything
        for (const wire of Simulator.allWires) {
            this.drawWire(wire);
        }
        for (const component of Simulator.allComponents) {
            this.drawComponent(component);
        }
        
        this.ctx.restore();
        
        // Restore the original context
        this.ctx = originalCtx;
    },
    
    // --- 3. Main Draw Loop ---

    /**
     * --- *** MODIFIED: Main draw loop now uses the virtual camera *** ---
     * @param {BaseGate} selectedComponent - The component to highlight
     * @param {Node} wiringNode - The node to highlight for wiring
     */
    draw: function(selectedComponent, wiringNode) {
        if (!this.ctx || !this.wrapper || this.canvas.width === 0 || this.canvas.height === 0) return;
        const ctx = this.ctx;
        
        // --- 1. Clear the *visible* canvas ---
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // --- 2. Apply the "camera" translation ---
        // All subsequent draws are now in "world space"
        ctx.translate(this.viewOffsetX, this.viewOffsetY);

        // --- 3. Draw all world elements ---
        this.drawGrid();

        for (const wire of Simulator.allWires) {
            this.drawWire(wire);
        }

        for (const component of Simulator.allComponents) {
            this.drawComponent(component);
        }

        if (selectedComponent) {
            this.drawSelectionHighlight(selectedComponent);
        }
        
        if (wiringNode) {
            this.drawNodeHighlight(wiringNode);
        }

        const activeAnims = AnimationManager.getActiveAnimations();
        this.drawAnimations(activeAnims);

        // --- 4. Restore context to default ---
        ctx.restore();
    },

    /**
     * --- *** MODIFIED: Draws grid based on camera position *** ---
     */
    drawGrid: function() {
        const ctx = this.ctx;
        const gridSize = this.GRID_SIZE;

        // Calculate the visible "world" coordinates
        const viewLeft = -this.viewOffsetX;
        const viewTop = -this.viewOffsetY;
        const viewRight = viewLeft + this.canvas.width;
        const viewBottom = viewTop + this.canvas.height;

        // Find the start and end grid lines to draw
        // (Add a 1-grid buffer for panning)
        const drawStartX = Math.max(0, Math.floor(viewLeft / gridSize) * gridSize - gridSize);
        const drawStartY = Math.max(0, Math.floor(viewTop / gridSize) * gridSize - gridSize);
        const drawEndX = Math.min(this.WORLD_WIDTH, Math.ceil(viewRight / gridSize) * gridSize + gridSize);
        const drawEndY = Math.min(this.WORLD_HEIGHT, Math.ceil(viewBottom / gridSize) * gridSize + gridSize);

        ctx.beginPath();
        ctx.strokeStyle = this.COLOR_GRID;
        ctx.lineWidth = 1;

        // Draw vertical lines
        for (let x = drawStartX; x <= drawEndX; x += gridSize) {
            ctx.moveTo(x, drawStartY); 
            ctx.lineTo(x, drawEndY);
        }
        // Draw horizontal lines
        for (let y = drawStartY; y <= drawEndY; y += gridSize) {
            ctx.moveTo(drawStartX, y); 
            ctx.lineTo(drawEndX, y);
        }
        ctx.stroke();
    },

    /**
     * Draws a single wire (coordinates are world coords).
     * @param {Wire} wire - The wire to draw.
     */
    drawWire: function(wire) {
        const ctx = this.ctx;
        const startX = wire.startNode.parentComponent.x + wire.startNode.relX;
        const startY = wire.startNode.parentComponent.y + wire.startNode.relY;
        const endX = wire.endNode.parentComponent.x + wire.endNode.relX;
        const endY = wire.endNode.parentComponent.y + wire.endNode.relY;

        ctx.beginPath();
        ctx.moveTo(startX, startY);

        const midX = startX + (endX - startX) / 2;
        
        const cpx1 = midX;
        const cpy1 = startY;
        const cpx2 = midX;
        const cpy2 = endY;

        ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, endX, endY);

        ctx.strokeStyle = (wire.state === 1) ? this.COLOR_WIRE_HIGH : this.COLOR_WIRE_LOW;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 1; // Reset line width
    },

    /**
     * --- MODIFIED: Calls drawComponentLabel ---
     */
    drawComponent: function(component) {
        if (component instanceof InputToggle) {
            this.drawInputToggle(component);
        } else if (component instanceof OutputLed) {
            this.drawOutputLed(component);
        } else {
            this.drawGateBody(component);
        }
        
        // --- NEW: Draw label ---
        this.drawComponentLabel(component);

        for (const node of component.getAllNodes()) {
            this.drawNode(node);
        }
    },
    
    /**
     * --- NEW: Draws the component's label ---
     * Draws custom label above, or default label in the middle.
     */
    drawComponentLabel: function(component) {
        const ctx = this.ctx;
        ctx.fillStyle = this.COLOR_COMPONENT_LABEL;
        ctx.textAlign = 'center';
        
        if (component.customLabel) {
            // Draw custom label *above* the component
            ctx.font = 'bold 13px Arial';
            ctx.textBaseline = 'bottom'; // Align to bottom of text
            ctx.fillText(
                component.customLabel, 
                component.x + component.width / 2, 
                component.y - 6 // 6px padding above
            );
        } else if (!(component instanceof InputToggle) && !(component instanceof OutputLed)) {
            // Draw default label (AND, OR) in the *middle*
            ctx.font = 'bold 16px Arial';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                component.label, 
                component.x + component.width / 2, 
                component.y + component.height / 2
            );
        }
        // Input/Output draw their own '0'/'1' state, so no label needed
    },

    /**
     * --- MODIFIED: No longer draws label ---
     */
    drawGateBody: function(component) {
        const ctx = this.ctx;
        ctx.fillStyle = this.COLOR_COMPONENT_FILL;
        ctx.strokeStyle = this.COLOR_COMPONENT_BORDER;
        ctx.lineWidth = 2;

        ctx.beginPath();
        if (ctx.roundRect) {
             ctx.roundRect(component.x, component.y, component.width, component.height, 8);
        } else {
            ctx.rect(component.x, component.y, component.width, component.height);
        }
        ctx.fill();
        ctx.stroke();

        // --- LABEL DRAWING REMOVED FROM HERE ---
    },

    drawInputToggle: function(component) {
        const ctx = this.ctx;
        ctx.strokeStyle = this.COLOR_COMPONENT_BORDER;
        ctx.lineWidth = 2;
        ctx.fillStyle = (component.state === 1) ? this.COLOR_INPUT_ON : this.COLOR_INPUT_OFF;

        ctx.beginPath();
        if (ctx.roundRect) {
             ctx.roundRect(component.x, component.y, component.width, component.height, 6);
        } else {
             ctx.rect(component.x, component.y, component.width, component.height);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = this.COLOR_COMPONENT_LABEL;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(component.state.toString(), component.x + component.width / 2, component.y + component.height / 2);
    },

    drawOutputLed: function(component) {
        const ctx = this.ctx;
        const x = component.x;
        const y = component.y;
        const width = component.width; // 40

        const centerX = x + width / 2;
        const bulbRadius = 12;
        const bulbCY = y + 15;
        const baseWidth = 16;
        const baseHeight = 11;
        const baseX = centerX - baseWidth / 2;
        const baseY = y + bulbCY + bulbRadius - 2; 

        const bulbFill = (component.state === 1) ? this.COLOR_LED_ON : this.COLOR_LED_OFF;
        const baseFill = this.COLOR_LED_OFF;
        ctx.strokeStyle = this.COLOR_COMPONENT_BORDER;
        ctx.lineWidth = 2;

        ctx.fillStyle = baseFill;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(baseX, baseY, baseWidth, baseHeight, 3);
        } else {
            ctx.rect(baseX, baseY, baseWidth, baseHeight);
        }
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = bulbFill;
        ctx.beginPath();
        ctx.arc(centerX, bulbCY, bulbRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    },

    /**
     * --- MODIFIED: Calls drawNodeLabel ---
     */
    drawNode: function(node) {
        const ctx = this.ctx;
        const x = node.parentComponent.x + node.relX;
        const y = node.parentComponent.y + node.relY;

        ctx.fillStyle = this.COLOR_NODE;
        ctx.beginPath();
        ctx.arc(x, y, this.NODE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        
        // --- NEW: Draw the label ---
        this.drawNodeLabel(node);
    },
    
    /**
     * --- NEW: Draws the node's label (A, B, in, out) ---
     */
    drawNodeLabel: function(node) {
        const ctx = this.ctx;
        const x = node.parentComponent.x + node.relX;
        const y = node.parentComponent.y + node.relY;
        const padding = this.NODE_RADIUS + 4; // 4px padding from node edge

        ctx.fillStyle = this.COLOR_NODE_LABEL;
        ctx.font = '12px Arial';
        ctx.textBaseline = 'middle';

        if (node.type === 'input') {
            ctx.textAlign = 'left';
            ctx.fillText(node.label, x + padding, y);
        } else { // 'output'
            ctx.textAlign = 'right';
            ctx.fillText(node.label, x - padding, y);
        }
    },
    
    drawNodeHighlight: function(node) {
        const ctx = this.ctx;
        const x = node.parentComponent.x + node.relX;
        const y = node.parentComponent.y + node.relY;

        ctx.fillStyle = this.COLOR_NODE_HIGHLIGHT;
        ctx.strokeStyle = this.COLOR_SELECTION_BORDER;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]); 

        ctx.beginPath();
        ctx.arc(x, y, this.NODE_RADIUS + 5, 0, Math.PI * 2); 
        ctx.fill();
        ctx.stroke();
        
        ctx.setLineDash([]); 
    },

    drawSelectionHighlight: function(component) {
        const ctx = this.ctx;
        const padding = 6;
        ctx.strokeStyle = this.COLOR_SELECTION_BORDER;
        ctx.fillStyle = this.COLOR_SELECTION;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);

        ctx.beginPath();
        const highlightRadius = 10;
        if (ctx.roundRect) {
            ctx.roundRect(
                component.x - padding,
                component.y - padding,
                component.width + padding * 2,
                component.height + padding * 2,
                highlightRadius
            );
        } else {
             ctx.rect(component.x - padding, component.y - padding, component.width + padding * 2, component.height + padding * 2);
        }
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
    },

    drawAnimations: function(animations) {
        for (const anim of animations) {
            if (anim.type === 'pulse') {
                this.drawPulse(anim);
            }
        }
    },

    drawPulse: function(animation) {
        const ctx = this.ctx;
        const wire = animation.target;
        if (!wire || !(wire instanceof Wire)) return;

        const now = Date.now();
        const elapsedTime = now - animation.startTime;
        let progress = elapsedTime / animation.duration;
        progress = Math.min(Math.max(progress, 0), 1); 

        const startX = wire.startNode.parentComponent.x + wire.startNode.relX;
        const startY = wire.startNode.parentComponent.y + wire.startNode.relY;
        const endX = wire.endNode.parentComponent.x + wire.endNode.relX;
        const endY = wire.endNode.parentComponent.y + wire.endNode.relY;

        // --- MODIFIED: Use the same "C" curve as drawWire ---
        const midX = startX + (endX - startX) / 2;
        const cpx1 = midX;
        const cpy1 = startY;
        const cpx2 = midX;
        const cpy2 = endY;
        // ---

        const pulsePos = this.getPointOnBezier(progress, startX, startY, cpx1, cpy1, cpx2, cpy2, endX, endY);

        ctx.beginPath();
        ctx.fillStyle = this.COLOR_PULSE;
        ctx.arc(pulsePos.x, pulsePos.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1;
    },

    getPointOnBezier: function(t, x0, y0, x1, y1, x2, y2, x3, y3) {
        const tInv = 1 - t;
        const tInv2 = tInv * tInv;
        const tInv3 = tInv2 * tInv;
        const t2 = t * t;
        const t3 = t2 * t;

        const x = tInv3 * x0 + 3 * tInv2 * t * x1 + 3 * tInv * t2 * x2 + t3 * x3;
        const y = tInv3 * y0 + 3 * tInv2 * t * y1 + 3 * tInv * t2 * y2 + t3 * y3;

        return { x, y };
    }
};