const body = document.body;
const mode = body.dataset.authMode || "login";
const form = document.getElementById(`${mode}-form`);
const alertBox = document.getElementById("auth-alert");

function setAlert(message, type = "error") {
    if (!alertBox) {
        return;
    }

    alertBox.textContent = message;
    alertBox.classList.remove("error", "success");
    if (message) {
        alertBox.classList.add(type);
    }
}

if (!form) {
    throw new Error(`Missing auth form for mode: ${mode}`);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAlert("");

    const payload = {};

    if (mode === "signup") {
        payload.username = document.getElementById("signup-name").value.trim();
        payload.email = document.getElementById("signup-email").value.trim();
        payload.password = document.getElementById("signup-password").value;
    } else {
        payload.email = document.getElementById("login-email").value.trim();
        payload.password = document.getElementById("login-password").value;
    }

    try {
        const response = await fetch(`/${mode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            setAlert(data.error || `${mode === "signup" ? "Signup" : "Login"} failed.`, "error");
            return;
        }

        if (mode === "signup") {
            setAlert(data.message || "Account created successfully.", "success");
            window.setTimeout(() => {
                window.location.href = "/login";
            }, 700);
            return;
        }

        setAlert("Login successful. Redirecting...", "success");
        window.setTimeout(() => {
            window.location.href = "/dashboard";
        }, 500);
    } catch {
        setAlert("Unable to reach server. Please try again.", "error");
    }
});
