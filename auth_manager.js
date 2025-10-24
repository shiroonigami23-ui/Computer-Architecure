// --- NEW FILE ---
// This manager handles all Firebase initialization and user authentication.
// Its job is to get a user signed in and provide the user's ID to other managers.

const AuthManager = {
    // --- 1. Properties ---
    app: null,
    auth: null,
    db: null,
    
    currentUserId: null,
    appId: 'default-app-id', // Will be replaced by global variable
    
    // --- 2. Initialization ---
    
    /**
     * Initializes the AuthManager.
     * This function is called by Main.init()
     */
    init: function() {
        console.log("Auth Manager initializing...");
        
        // Get global config provided by the environment
        try {
            this.appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const firebaseConfigStr = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
            
            // Start the firebase connection
            this.initializeFirebase(firebaseConfigStr);

        } catch (error) {
            console.error("Critical error during AuthManager init:", error);
            AnimationManager.logError(`Auth Error: ${error.message}`);
            this.updateAuthButton(null, true); // Show error on button
        }
        
        // Add a listener to the auth button
        // For now, it just logs the user ID when clicked
        const authButton = document.getElementById('auth-btn');
        authButton?.addEventListener('click', () => {
            if (this.currentUserId) {
                AnimationManager.logStep(`You are logged in. User ID: \`${this.currentUserId}\``);
            } else {
                AnimationManager.logError("Still connecting... please wait.");
            }
        });
    },

    /**
     * Connects to Firebase, sets up auth, and signs in the user.
     * @param {string} firebaseConfigStr - The JSON string config.
     */
    initializeFirebase: async function(firebaseConfigStr) {
        if (!window.firebase) {
            console.error("Firebase SDK not loaded. Auth Manager cannot start.");
            AnimationManager.logError("Error: Firebase services failed to load.");
            return;
        }

        // De-structure the functions we need from the global object
        const { 
            initializeApp, getAuth, getFirestore, 
            onAuthStateChanged, signInAnonymously, signInWithCustomToken 
        } = window.firebase;

        try {
            const firebaseConfig = JSON.parse(firebaseConfigStr);
            if (!firebaseConfig.apiKey) {
                 throw new Error("Firebase config is missing or invalid.");
            }

            this.app = initializeApp(firebaseConfig);
            this.auth = getAuth(this.app);
            this.db = getFirestore(this.app); // Initialize Firestore

            // --- Auth State Listener ---
            // This runs ONCE on load, and again any time auth changes
            onAuthStateChanged(this.auth, (user) => {
                if (user) {
                    // User is signed in
                    this.currentUserId = user.uid;
                    console.log("Firebase Auth: User signed in with ID:", this.currentUserId);
                    this.updateAuthButton(user);
                    
                    // --- *** MODIFIED: THIS IS THE FINAL CONNECTION *** ---
                    // Tell the app we're ready for cloud storage
                    if (window.StorageManager) {
                         StorageManager.onUserLogin(this.currentUserId);
                    }
                    // --- *** ---
                    
                    AnimationManager.logStep("Connected to cloud services.");
                    
                } else {
                    // User is signed out
                    this.currentUserId = null;
                    console.log("Firebase Auth: User signed out.");
                    this.updateAuthButton(null);
                    
                    // --- *** MODIFIED: THIS IS THE FINAL CONNECTION *** ---
                    if (window.StorageManager) {
                         StorageManager.onUserLogout();
                    }
                    // --- *** ---
                    
                    AnimationManager.logError("Disconnected from cloud services.");
                }
            });
            
            // --- Initial Sign-In ---
            // Try token auth first, fall back to anonymous
            const authToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
            
            if (authToken) {
                console.log("Attempting to sign in with custom token...");
                await signInWithCustomToken(this.auth, authToken);
            } else {
                console.log("No custom token found, signing in anonymously...");
                await signInAnonymously(this.auth);
            }

        } catch (error) {
            console.error("Firebase initialization error:", error);
            AnimationManager.logError(`Auth Error: ${error.message}`);
            this.updateAuthButton(null, true); // Show error state
        }
    },

    /**
     * Updates the #auth-btn to show the current login state.
     * @param {object|null} user - The Firebase user object, or null.
     * @param {boolean} isError - True if an error occurred.
     */
    updateAuthButton: function(user, isError = false) {
        const authButton = document.getElementById('auth-btn');
        if (!authButton) return;

        const icon = authButton.querySelector('i');
        const span = authButton.querySelector('span');

        if (isError) {
            if (icon) icon.setAttribute('data-lucide', 'alert-triangle');
            if (span) span.textContent = 'Auth Error';
            authButton.title = "Could not connect to authentication services.";
            authButton.classList.add('tool-delete'); // Make it red
        } else if (user) {
            if (icon) icon.setAttribute('data-lucide', 'user');
            if (span) span.textContent = 'Account';
            // Show the first 6 chars of UID in the tooltip
            const shortId = user.uid.substring(0, 6);
            authButton.title = `Logged in as: ${shortId}...`;
            authButton.classList.remove('tool-delete');
            // --- NEW: Make it green to show success ---
            authButton.style.borderColor = 'var(--gate-color)';
            authButton.style.color = 'var(--gate-color)';
        } else {
            // Default "Login" state
            if (icon) icon.setAttribute('data-lucide', 'log-in');
            if (span) span.textContent = 'Login';
            authButton.title = "Login for Cloud Save";
            authButton.classList.remove('tool-delete');
            authButton.style.borderColor = 'var(--auth-color)'; // Back to teal
            authButton.style.color = 'var(--auth-color)';
        }
        
        // We *must* call this, as we've changed the `data-lucide` attribute
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    // --- 4. Public API ---
    
    /**
     * Public getter for the current user's ID.
     * @returns {string|null} The current user's UID or null.
     */
    getUserId: function() {
        return this.currentUserId;
    },
    
    /**
     * Public getter for the app ID.
     * @returns {string} The current app's ID.
     */
    getAppId: function() {
         return this.appId;
    }
};
