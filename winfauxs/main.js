let windows = [];
let activeWindow;

class ViewBorder {
  constructor(viewWindow, parentElement) {
    this.viewWindow = viewWindow;
    this.parentElement = parentElement;
    this.setUp();
  }

  setUp() {
    // TODO: Dynamically add divs to the parent element instead of inserting them manually into HTML
    this.parentElement.querySelector('.view-window-border-nw').addEventListener('mousedown', (event) => {
      this.viewWindow.setAsActive();
      this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, ['n', 'w']);
      document.getElementsByTagName('body')[0].style.cursor = 'nw-resize';
    });
    this.parentElement.querySelector('.view-window-border-n').addEventListener('mousedown', (event) => {
      this.viewWindow.setAsActive();
      this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, ['n']);
      document.getElementsByTagName('body')[0].style.cursor = 'n-resize';
    });
    this.parentElement.querySelector('.view-window-border-ne').addEventListener('mousedown', (event) => {
      this.viewWindow.setAsActive();
      this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, ['n', 'e']);
      document.getElementsByTagName('body')[0].style.cursor = 'ne-resize';
    });
    this.parentElement.querySelector('.view-window-border-w').addEventListener('mousedown', (event) => {
      this.viewWindow.setAsActive();
      this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, ['w']);
      document.getElementsByTagName('body')[0].style.cursor = 'w-resize';
    });
    this.parentElement.querySelector('.view-window-border-e').addEventListener('mousedown', (event) => {
      this.viewWindow.setAsActive();
      this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, ['e']);
      document.getElementsByTagName('body')[0].style.cursor = 'e-resize';
    });
    this.parentElement.querySelector('.view-window-border-sw').addEventListener('mousedown', (event) => {
      this.viewWindow.setAsActive();
      this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, ['s', 'w']);
      document.getElementsByTagName('body')[0].style.cursor = 'sw-resize';
    });
    this.parentElement.querySelector('.view-window-border-s').addEventListener('mousedown', (event) => {
      this.viewWindow.setAsActive();
      this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, ['s']);
      document.getElementsByTagName('body')[0].style.cursor = 's-resize';
    });
    this.parentElement.querySelector('.view-window-border-se').addEventListener('mousedown', (event) => {
      this.viewWindow.setAsActive();
      this.viewWindow.startResize(event.clientX, event.clientY, event.buttons, ['s', 'e']);
      document.getElementsByTagName('body')[0].style.cursor = 'se-resize';
    });
  }
}

class ViewWindow {
  constructor(id) {
    this.id = id;
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.resizingLeft = false;
    this.resizingRight = false;
    this.resizingTop = false;
    this.resizingBottom = false;
    this.anchorX = 0;
    this.anchorY = 0;
    this.setUp();
  }

  setUp() {
    this.element = document.getElementById(this.id);
    this.titleElement = this.element.querySelector('.view-window-title');
    this.contentElement = this.element.querySelector('.view-window-content');

    this.titleElement.addEventListener('mousedown', (event) => {
      if (event.buttons & 1) {
        this.dragging = true;
        const style = window.getComputedStyle(this.element);
        this.dragStartX = event.clientX - style.getPropertyValue('--xpos');
        this.dragStartY = event.clientY - style.getPropertyValue('--ypos');
      }
    });
    this.element.addEventListener('mousedown', (event) => {
      this.setAsActive();
    });

    this.viewBorder = new ViewBorder(this, this.element);

    this.setAsActive();
  }

  handleMouseMove(clientX, clientY, buttons) {
    if (this.dragging) {
      this.handleMove(clientX, clientY, buttons);
    } else if (this.resizingLeft || this.resizingRight || this.resizingTop || this.resizingBottom) {
      this.handleResize(clientX, clientY, buttons);
    }
  }

  handleMove(clientX, clientY, buttons) {
    if (buttons !== 1) {
      this.dragging = false;
      return;
    }
    const x = Math.max(Math.min(clientX - this.dragStartX, window.innerWidth - 100), 0);
    const y = Math.max(Math.min(clientY - this.dragStartY, window.innerHeight - 100), 0);
    this.element.style.setProperty('--xpos', x);
    this.element.style.setProperty('--ypos', y);
  }

  startResize(clientX, clientY, buttons, types) {
    if (buttons !== 1) return;
    const style = window.getComputedStyle(this.element);
    types.forEach((type) => {
      switch (type) {
        case 'e':
          this.anchorX = clientX - parseInt(style.width, 10);
          this.resizingRight = true;
          break;
        case 'w':
          this.anchorX = clientX + parseInt(style.width, 10);
          this.resizingLeft = true;
          break;
        case 'n':
          this.anchorY = clientY + parseInt(style.height, 10);
          this.resizingTop = true;
          break;
        case 's':
          this.anchorY = clientY - parseInt(style.height, 10);      
          this.resizingBottom = true;
          break;
      }
    });
  }

  handleResize(clientX, clientY, buttons, type) {
    if (buttons !== 1) {
      this.resizingLeft = false;
      this.resizingRight = false;
      this.resizingTop = false;
      this.resizingBottom = false;
      document.getElementsByTagName('body')[0].style.removeProperty('cursor');
      return;
    }
    const style = window.getComputedStyle(this.element);
    const minWidth = parseInt(style.minWidth, 10);
    const minHeight = parseInt(style.minHeight, 10);
    if (this.resizingLeft) {
      const newX = Math.min(Math.max(0, clientX), this.anchorX - minWidth);
      this.element.style.width = this.anchorX - newX;
      this.element.style.setProperty('--xpos', newX);
    } else if (this.resizingRight) {
      const newWidth = clientX - this.anchorX;
      const x = parseInt(style.getPropertyValue('--xpos'), 10);
      this.element.style.width = Math.min(Math.max(newWidth, minWidth), window.innerWidth - x);
    }
    if (this.resizingTop) {
      const newY = Math.min(Math.max(0, clientY), this.anchorY - minHeight);
      this.element.style.height = this.anchorY - newY;
      this.element.style.setProperty('--ypos', newY);
    } else if (this.resizingBottom) {
      const newHeight = clientY - this.anchorY;
      const y = parseInt(style.getPropertyValue('--ypos'), 10);
      this.element.style.height = Math.min(Math.max(newHeight, minHeight), window.innerHeight - y);
    }
  }

  fitInWindow() {
    const style = window.getComputedStyle(this.element);
    const x = Math.max(Math.min(style.getPropertyValue('--xpos'), window.innerWidth - 100), 0);
    const y = Math.max(Math.min(style.getPropertyValue('--ypos'), window.innerHeight - 100), 0);
    this.element.style.setProperty('--xpos', x);
    this.element.style.setProperty('--ypos', y);
  }

  setAsActive() {
    if (activeWindow) {
      activeWindow.setPriority(1);
    }
    this.setPriority(100);
    activeWindow = this;
  }

  setPriority(priority) {
    this.element.style.setProperty('z-index', priority)
  }
}

function onLoad() {
  windows.push(new ViewWindow('mainWindow'));
  windows.push(new ViewWindow('secondaryWindow'));

  document.addEventListener('mousemove', (event) => {
    if (activeWindow) {
      activeWindow.handleMouseMove(event.clientX, event.clientY, event.buttons);
    }
  });
  window.addEventListener("resize", () => {
    windows.forEach((w) => w.fitInWindow());
  });
}

window.onload = function() {
  onLoad();
}
