import { mount } from 'svelte';
import './app/global.css';
import App from './app/App.svelte';
import { initTheme } from './app/theme';

initTheme();

mount(App, { target: document.getElementById('app')! });
