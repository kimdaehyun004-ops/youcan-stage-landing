// 콘솔 창 <-> 프롬프터 창 실시간 통신. 같은 브라우저의 같은 origin에서만 동작합니다.
const PrompterBus = (() => {
  const CHANNEL_NAME = 'lyrics-prompter-channel';
  const CURRENT_KEY = 'lp:current';
  const FONT_SIZE_KEY = 'lp:fontSize';

  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;

  return {
    showSong(song) {
      localStorage.setItem(CURRENT_KEY, JSON.stringify({ type: 'show', song }));
      if (channel) channel.postMessage({ type: 'show', song });
    },

    clear() {
      localStorage.setItem(CURRENT_KEY, JSON.stringify({ type: 'clear' }));
      if (channel) channel.postMessage({ type: 'clear' });
    },

    setFontSize(size) {
      localStorage.setItem(FONT_SIZE_KEY, String(size));
      if (channel) channel.postMessage({ type: 'fontSize', size });
    },

    getCurrent() {
      try {
        const raw = localStorage.getItem(CURRENT_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        return null;
      }
    },

    getFontSize(defaultSize) {
      const raw = localStorage.getItem(FONT_SIZE_KEY);
      const size = raw ? Number(raw) : NaN;
      return Number.isFinite(size) ? size : defaultSize;
    },

    onMessage(handler) {
      if (channel) channel.addEventListener('message', (e) => handler(e.data));
    },
  };
})();
