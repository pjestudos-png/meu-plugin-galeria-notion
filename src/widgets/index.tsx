import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';

async function onActivate(plugin: ReactRNPlugin) {
  // Registra a barra lateral buscando EXATAMENTE o arquivo 'galeria_notion'
  await plugin.app.registerWidget('galeria_notion', WidgetLocation.RightSidebar, {
    dimensions: { height: 'auto', width: '100%' },
    widgetTabIcon: 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png',
    widgetTabTitle: 'Minha Biblioteca',
  });

  // O comando na Omnibar (Ctrl + /)
  await plugin.app.registerCommand({
    id: 'abrir-galeria',
    name: 'Abrir Minha Biblioteca',
    action: async () => {
      await plugin.window.openWidgetInPane('galeria_notion');
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);