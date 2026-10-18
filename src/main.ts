import { createApp } from 'vue'
import { defineStickyflowDiagram } from 'stickyflow/web-component'
import App from './App.vue'
import './style.css'

// Registers <stickyflow-diagram> once, globally, before the app that uses it
// mounts. This is the entire integration surface on the Vue side; everything
// else is plain Vue binding to a plain custom element.
defineStickyflowDiagram()

createApp(App).mount('#app')
