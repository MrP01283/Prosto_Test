try { document.documentElement.dataset.theme = localStorage.getItem('prosto-test-theme') === 'dark' ? 'dark' : 'light'; } catch { /* Default light theme also works without localStorage. */ }
