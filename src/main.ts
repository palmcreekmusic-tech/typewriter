import { mount } from 'svelte';
import './app/global.css';
import App from './app/App.svelte';

mount(App, { target: document.getElementById('app')! });
