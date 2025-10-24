// --- NEW FILE ---
// This manager handles all Firebase initialization and user authentication.
// Its job is to get a user signed in and provide the user's ID to other managers.

// --- *** FIX: Added your specific Firebase Config *** ---
const firebaseConfig = {
  apiKey: "AIzaSyCGRmgpO1bqkn6EMqWLExJLW8R7uTCZpIM",
  authDomain: "computer-arch-169e8.firebaseapp.com",
  projectId: "computer-arch-169e8",
  storageBucket: "computer-arch-169e8.firebasestorage.app",
  messagingSenderId: "1003598893307",
  appId: "1:1003598893307:web:8a731f4b492148815e205e"
};
// --- *** END FIX *** ---

const AuthManager = {
    // --- 1. Properties ---
    app: null,
    auth: null,
    db: null,
    
    currentUserId: null,
    
    // --- 2. Initialization ---
    
    /**
     * Initializes the AuthManager.
     * This function is called by Main.init()
     */
    init: function() {
        console.log("Auth Manager initializing...");
        
        try {
            // --- *** FIX: Call initializeFirebase directly with the config *** ---
            this.initializeFirebase(firebaseConfig);
        } catch (error) {
            console.error("Critical error during AuthManager init:", error);
            AnimationManager.logError(`Auth Error: ${error.message}`);
            this.updateAuthButton(null, true); // Show error on button
        }
        
        // Add a listener to the auth button
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
     * @param {object} config - The firebaseConfig object.
     */
    initializeFirebase: async function(config) {
        if (!window.firebase) {
            console.error("Firebase SDK not loaded. Auth Manager cannot start.");
            AnimationManager.logError("Error: Firebase services failed to load.");
            return;
        }

        // De-structure the functions we need from the global object
        const { 
            initializeApp, getAuth, getFirestore, 
            onAuthStateChanged, signInAnonymously 
        } = window.firebase;

        try {
            if (!config.apiKey) {
                 throw new Error("Firebase config is missing or invalid.");
            }

            this.app = initializeApp(config);
            this.auth = getAuth(this.app);
            this.db = getFirestore(this.app); // Initialize Firestore

            // --- Auth State Listener ---
            onAuthStateChanged(this.auth, (user) => {
                if (user) {
                    // User is signed in
                    this.currentUserId = user.uid;
                    console.log("Firebase Auth: User signed in with ID:", this.currentUserId);
                    this.updateAuthButton(user);
                    
                    if (window.StorageManager) {
                         StorageManager.onUserLogin(this.currentUserId);
                    }
                    AnimationManager.logStep("Connected to cloud services.");
                    
                } else {
                    // User is signed out
                    this.currentUserId = null;
                    console.log("Firebase Auth: User signed out.");
                    this.updateAuthButton(null);
                    
                    if (window.StorageManager) {
                         StorageManager.onUserLogout();
                    }
                    AnimationManager.logError("Disconnected from cloud services.");
                }
            });
            
            // --- *** FIX: Simplified Sign-In *** ---
            // We removed all token logic and will ONLY sign in anonymously.
            // This will get a valid user ID every time.
            console.log("Signing in anonymously...");
            await signInAnonymously(this.auth);

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
            authButton.style.borderColor = 'var(--gate-color)';
            authButton.style.color = 'var(--gate-color)';
        } else {
            // Default "Login" state
            if (icon) icon.setAttribute('data-lucide', 'log-in');
            if (span) span.textContent = 'Login';
            authButton.title = "Login for Cloud Save";
            authButton.classList.remove('tool-delete');
            authButton.style.borderColor = 'var(--auth-color)';
route
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
     * Public getter for the project ID.
     * @returns {string} The current app's ID.
     */
    getProjectId: function() {
         return firebaseConfig.projectId;
    }
};
