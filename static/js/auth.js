const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const title = document.getElementById("auth-title");
const subtitle = document.getElementById("auth-subtitle");
const switchWrap = document.getElementById("auth-switch-wrap");
const alertBox = document.getElementById("auth-alert");

let activeView = "login";

function setAlert(message, type = "error") {
    alertBox.textContent = message;
    alertBox.classList.remove("error", "success");
    if (message) {
        alertBox.classList.add(type);
    }
}

function setView(view) {
    activeView = view;
    const isLogin = view === "login";

    loginForm.classList.toggle("hidden", !isLogin);
    signupForm.classList.toggle("hidden", isLogin);

    if (isLogin) {
        title.textContent = "Welcome back";
        subtitle.textContent = "Log in to continue your BuddyAI study workspace.";
        switchWrap.innerHTML = 'New to BuddyAI? <button id="switch-to-signup" type="button">Create an account</button>';
    } else {
        title.textContent = "Create your account";
        subtitle.textContent = "Set up BuddyAI and start analyzing academic documents.";
        switchWrap.innerHTML = 'Already have an account? <button id="switch-to-login" type="button">Log in</button>';
    }

    const switchBtn = switchWrap.querySelector("button");
    if (switchBtn) {
        switchBtn.addEventListener("click", () => setView(isLogin ? "signup" : "login"));
    }

    setAlert("");
}

if (window.location.hash === "#signup") {
    setView("signup");
} else {
    setView("login");
}

signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAlert("");

    const payload = {
        username: document.getElementById("signup-username").value.trim(),
        email: document.getElementById("signup-email").value.trim(),
        password: document.getElementById("signup-password").value,
    };

    try {
        const response = await fetch("/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (!response.ok) {
            setAlert(data.error || "Signup failed.", "error");
            return;
        }

        setAlert(data.message || "Account created successfully. Please login.", "success");
        signupForm.reset();
        setTimeout(() => setView("login"), 650);
    } catch (error) {
        setAlert("Unable to reach server. Please try again.", "error");
    }
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAlert("");

    const payload = {
        email: document.getElementById("login-email").value.trim(),
        password: document.getElementById("login-password").value,
    };

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (!response.ok) {
            setAlert(data.error || "Invalid login credentials.", "error");
            return;
        }

        setAlert("Login successful. Redirecting...", "success");
        setTimeout(() => {
            window.location.href = "/dashboard";
        }, 400);
    } catch (error) {
        setAlert("Unable to reach server. Please try again.", "error");
    }
});
