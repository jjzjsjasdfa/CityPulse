import { registerRootComponent } from 'expo';

import App from './App';

/** Expo entry point: registers `App` for development clients and production builds. */
// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
