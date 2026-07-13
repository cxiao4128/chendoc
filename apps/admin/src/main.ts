import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import { useThemeStore } from "./stores/theme";
import "./styles/variables.css";
import "./styles/reset.css";
import "./styles/base.css";
import App from "./pages/admin/App.vue";

document.documentElement.dataset.chendocBuild = "login-polish-20260606";

const pinia = createPinia();
const app = createApp(App);

app.use(pinia).use(router);
useThemeStore(pinia).applyTheme();
app.mount("#app");
