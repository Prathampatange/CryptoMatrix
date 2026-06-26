const themeBtn = document.getElementById("theme-btn");

const savedTheme = localStorage.getItem("theme");

if (savedTheme === "light") {
    document.body.classList.add("light-mode");
    themeBtn.textContent = "☀️ Light";
}

themeBtn.addEventListener("click", () => {

    document.body.classList.toggle("light-mode");

    if (document.body.classList.contains("light-mode")) {

        localStorage.setItem("theme", "light");
        themeBtn.textContent = "☀️ Light";

    } else {

        localStorage.setItem("theme", "dark");
        themeBtn.textContent = "🌙 Dark";

    }

});