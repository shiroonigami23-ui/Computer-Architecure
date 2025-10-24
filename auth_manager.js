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
    currentUser: null, // --- NEW: Store the full user object
    
    // --- NEW: Splash Screen UI ---
    splashScreen: null,
    splashLoading: null,
    splashLoginBtn: null,
    splashError: null,
    
    // --- 2. Initialization ---
    
    /**
     * Initializes the AuthManager.
     * This function is called by Main.init()
     */
    init: function() {
        console.log("Auth Manager initializing...");
        
        // --- NEW: Get Splash Screen elements ---
        this.splashScreen = document.getElementById('splash-screen');
        this.splashLoading = document.getElementById('splash-loading');
        this.splashLoginBtn = document.getElementById('splash-login-btn');
        this.splashError = document.getElementById('splash-error');
        
        // --- Hook up splash screen login button ---
        this.splashLoginBtn?.addEventListener('click', () => this.signInWithGoogle());
        
        try {
            this.initializeFirebase(firebaseConfig);
        } catch (error) {
            console.error("Critical error during AuthManager init:", error);
            // --- NEW: Show error on splash screen ---
            this.showSplashError(`Auth Error: ${error.message}`);
        }
        
        // --- MODIFIED: This button is now just for LOGOUT ---
        const authButton = document.getElementById('auth-btn');
        authButton?.addEventListener('click', () => {
            if (this.currentUserId) {
                // If user is logged IN, the button should log them OUT
                this.signOutUser();
            }
            // No 'else' needed, login is handled by splash screen
        });
    },

    /**
     * Connects to Firebase, sets up auth, and signs in the user.
     * @param {object} config - The firebaseConfig object.
     */
    initializeFirebase: async function(config) {
        if (!window.firebase) {
            console.error("Firebase SDK not loaded. Auth Manager cannot start.");
            this.showSplashError("Error: Firebase services failed to load.");
            return;
        }

        // De-structure the functions we need from the global object
        const { 
            initializeApp, getAuth, getFirestore, 
            onAuthStateChanged
        } = window.firebase;

        try {
            if (!config.apiKey) {
                 throw new Error("Firebase config is missing or invalid.");
            }

            this.app = initializeApp(config);
            this.auth = getAuth(this.app);
            this.db = getFirestore(this.app); // Initialize Firestore

            // --- Auth State Listener ---
            // This is now the main controller for the app
            onAuthStateChanged(this.auth, (user) => {
                if (user) {
                    // --- User is signed in ---
                    this.currentUserId = user.uid;
                    this.currentUser = user; 
                    console.log("Firebase Auth: User signed in:", user.displayName, user.uid);
                    
                    // --- NEW: Launch the main application ---
                    this.launchApp(user);
                    
                } else {
                    // --- User is signed out ---
                    this.currentUserId = null;
                    this.currentUser = null; 
                    console.log("Firebase Auth: User signed out.");
                    
                    // --- NEW: Show the login button on the splash screen ---
                    this.showLoginButton();

                    // If the app was visible, hide it and show splash
                    const appContainer = document.querySelector('.app-container');
                    if (appContainer && appContainer.classList.contains('app-visible')) {
                        appContainer.classList.remove('app-visible');
                        this.splashScreen.classList.remove('hidden');
                    }
                }
            });

        } catch (error) {
            console.error("Firebase initialization error:", error);
            this.showSplashError(`Firebase Error: ${error.message}`);
        }
    },
    
    // --- NEW: Splash Screen UI Functions ---
    
    showLoginButton: function() {
        this.splashLoading?.classList.add('hidden');
        this.splashError?.classList.add('hidden');
        this.splashLoginBtn?.classList.remove('hidden');
        
        // Make sure icons are drawn
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    },
    
    showSplashError: function(message) {
        this.splashLoading?.classList.add('hidden');
        this.splashLoginBtn?.classList.add('hidden');
        this.splashError.textContent = message;
        this.splashError.classList.remove('hidden');
    },
    
    // --- NEW: App Launcher ---
    /**
     * Hides splash screen and initializes all other app managers.
     * @param {object} user - The Firebase user object
     */
    launchApp: function(user) {
        console.log(`Launching app for ${user.displayName}...`);
        
        // --- 1. Hide Splash Screen and Show App ---
        this.splashScreen?.classList.add('hidden');
        const appContainer = document.querySelector('.app-container');
        appContainer?.classList.add('app-visible');
        
        // --- 2. Initialize all other managers ---
        // We do this *after* login is confirmed
        // (Main.init will call all the others)
        Main.init(); 

        // --- 3. Update the (now visible) Logout button ---
        this.updateAuthButton(user);
        
        // --- 4. Manually call the onUserLogin functions ---
        // This is what we removed from onAuthStateChanged
        if (window.StorageManager) {
             StorageManager.onUserLogin(this.currentUserId);
        }
        if (window.AnimationManager) {
            AnimationManager.logStep(`Welcome, ${user.displayName}! Connected to cloud services.`);
        }
    },
    
    
    // --- NEW: Google Sign-In Function ---
    signInWithGoogle: async function() {
        if (!this.auth || !window.firebase) {
            this.showSplashError("Auth service is not ready.");
            return;
        }
        
        const { GoogleAuthProvider, signInWithPopup } = window.firebase;
        const provider = new GoogleAuthProvider();
        
        try {
            // --- NEW: Show loading state on splash ---
            this.splashLoginBtn?.classList.add('hidden');
            this.splashError?.classList.add('hidden');
            this.splashLoading?.classList.remove('hidden');
            
            console.log("Opening Google Sign-In popup...");
            const result = await signInWithPopup(this.auth, provider);
            
            // Success! The onAuthStateChanged listener will handle launching the app.
            console.log(`Login successful for ${result.user.displayName}`);

        } catch (error) {
            if (error.code === 'auth/popup-closed-by-user') {
                this.showLoginButton(); // User cancelled, show button again
            } else {
                console.error("Google Sign-In Error:", error);
                this.showSplashError(`Sign-in failed: ${error.message}`);
            }
        }
    },
    
    // --- NEW: Sign-Out Function ---
    signOutUser: async function() {
        if (!this.auth || !window.firebase) {
            AnimationManager.logError("Auth service is not ready.");
            return;
        }
        
        const { signOut } = window.firebase;
        
        try {
            AnimationManager.logStep("Logging out...");
            await signOut(this.auth);
            
            // Success! The onAuthStateChanged listener will handle
            // hiding the app and showing the splash screen.
            
            // --- NEW: We must also clear the app state ---
            // This is critical to prevent seeing old user data on new login
            Simulator.resetSimulation();
            
            console.log("Logout successful.");

        } catch (error) {
            console.error("Sign-Out Error:", error);
            AnimationManager.logError(`Sign-out failed: ${error.message}`);
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
            // This state should no longer happen, but good to keep
            if (icon) icon.setAttribute('data-lucide', 'alert-triangle');
            if (span) span.textContent = 'Auth Error';
            authButton.title = "Could not connect to authentication services.";
            authButton.classList.add('tool-delete'); // Make it red
        } else if (user) {
            // --- MODIFIED: Show user name and Logout icon ---
            if (icon) icon.setAttribute('data-lucide', 'log-out'); // Change to logout icon
            if (span) span.textContent = user.displayName || "Account"; // Show user's name
            authButton.title = `Logged in as: ${user.email}\nClick to Log Out.`;
            authButton.classList.remove('tool-delete');
            authButton.style.borderColor = 'var(--auth-color)';
            authButton.style.color = 'var(--auth-color)';
        } else {
            // --- MODIFIED: This is the "Logged Out" state ---
            // This button will be hidden, but we'll style it just in case
            if (icon) icon.setAttribute('data-lucide', 'log-in');
            if (span) span.textContent = 'Login';
            authButton.title = "Login with Google for Cloud Save";
            authButton.classList.remove('tool-delete');
            authButton.style.borderColor = 'var(--auth-color)';
            authButton.style.color = 'var(--auth-color)';
        }
        
        // We *must* call this, as we've changed the `data-lucide` attribute
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
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

// --- NEW: Auto-run the AuthManager ---
// This kicks off the whole process on page load.
window.onload = () => {
    AuthManager.init();
};
