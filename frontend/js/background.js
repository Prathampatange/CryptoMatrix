/**
 * frontend/js/background.js
 * Animated particle network background for CryptoMatrix.
 */

(function () {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let W, H;

    const PARTICLE_COUNT = 55;
    const MAX_DIST = 120;
    const SPEED = 0.25;

    const resize = () => {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    };

    class Particle {
        constructor() { this.reset(); }

        reset() {
            this.x = Math.random() * W;
            this.y = Math.random() * H;
            this.vx = (Math.random() - 0.5) * SPEED;
            this.vy = (Math.random() - 0.5) * SPEED;
            this.r = Math.random() * 1.5 + 0.5;
            this.alpha = Math.random() * 0.4 + 0.1;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > W) this.vx *= -1;
            if (this.y < 0 || this.y > H) this.vy *= -1;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 245, 196, ${this.alpha})`;
            ctx.fill();
        }
    }

    const init = () => {
        resize();
        particles = Array.from({ length: PARTICLE_COUNT }, () => new Particle());
        window.addEventListener('resize', () => {
            resize();
            particles.forEach((p) => p.reset());
        });
        requestAnimationFrame(animate);
    };

    const animate = () => {
        ctx.clearRect(0, 0, W, H);

        // Draw connecting lines between nearby particles
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < MAX_DIST) {
                    const alpha = (1 - dist / MAX_DIST) * 0.12;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0, 245, 196, ${alpha})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        // Update and draw each particle
        particles.forEach((p) => { p.update(); p.draw(); });

        requestAnimationFrame(animate);
    };

    // Start after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();