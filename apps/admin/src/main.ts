import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import "./styles/variables.css";
import "./styles/reset.css";
import "./styles/base.css";
import App from "./pages/admin/App.vue";

createApp(App).use(createPinia()).use(router).mount("#app");
