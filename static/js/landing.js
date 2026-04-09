const reveals = document.querySelectorAll(".reveal");
const motionCards = Array.from(document.querySelectorAll("[data-motion-card]"));
const typingNode = document.querySelector(".demo-typing");

const revealObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                revealObserver.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.14 }
);

reveals.forEach((item) => revealObserver.observe(item));

const motionState = {
    targetScroll: window.scrollY,
    easedScroll: window.scrollY,
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

function progressForCard(path, scrollProgress) {
    switch (path) {
        case "a":
            return {
                x: lerp(-100, 26, scrollProgress),
                y: lerp(-70, 24, scrollProgress),
                scale: lerp(0.95, 1.03, scrollProgress),
                rotate: lerp(-8, 0, scrollProgress),
            };
        case "b":
            return {
                x: lerp(34, -18, scrollProgress),
                y: lerp(18, 70, scrollProgress),
                scale: lerp(0.98, 1.04, scrollProgress),
                rotate: lerp(5, -6, scrollProgress),
            };
        case "c":
            return {
                x: lerp(-20, 56, scrollProgress),
                y: lerp(26, -18, scrollProgress),
                scale: lerp(1, 1.06, scrollProgress),
                rotate: lerp(-3, 4, scrollProgress),
            };
        case "diag-a":
            return {
                x: lerp(-160, 260, scrollProgress),
                y: lerp(-120, 170, scrollProgress),
                scale: lerp(0.9, 1.08, scrollProgress),
                rotate: lerp(-12, 12, scrollProgress),
            };
        case "diag-b":
            return {
                x: lerp(-120, 240, scrollProgress),
                y: lerp(170, -110, scrollProgress),
                scale: lerp(0.9, 1.08, scrollProgress),
                rotate: lerp(10, -10, scrollProgress),
            };
        default:
            return {
                x: 0,
                y: 0,
                scale: 1,
                rotate: 0,
            };
    }
}

function updateMotion() {
    motionState.targetScroll = window.scrollY;
    motionState.easedScroll = lerp(motionState.easedScroll, motionState.targetScroll, 0.08);

    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const scrollProgress = clamp(motionState.easedScroll / maxScroll, 0, 1);

    motionCards.forEach((card, index) => {
        const motion = progressForCard(card.dataset.path || String(index), scrollProgress);
        card.style.transform = `translate3d(${motion.x}px, ${motion.y}px, 0) scale(${motion.scale}) rotate(${motion.rotate}deg)`;
    });

    requestAnimationFrame(updateMotion);
}

window.addEventListener("scroll", () => {
    motionState.targetScroll = window.scrollY;
});

requestAnimationFrame(updateMotion);

if (typingNode) {
    const fullText = typingNode.textContent.trim();
    typingNode.textContent = "";

    let charIndex = 0;
    let direction = 1;
    let pauseFrames = 0;

    const tick = () => {
        if (pauseFrames > 0) {
            pauseFrames -= 1;
        } else if (direction === 1) {
            charIndex += 1;
            typingNode.textContent = fullText.slice(0, charIndex);
            if (charIndex >= fullText.length) {
                direction = -1;
                pauseFrames = 90;
            }
        } else {
            charIndex -= 1;
            typingNode.textContent = fullText.slice(0, charIndex);
            if (charIndex <= 8) {
                direction = 1;
                pauseFrames = 45;
            }
        }

        requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}
