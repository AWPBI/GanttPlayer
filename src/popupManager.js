import Popup from './popup';

export default class PopupManager {
    constructor(gantt) {
        this.gantt = gantt;
        this.popup = null;
    }

    show(options) {
        if (this.gantt.options.popup === false) return;
        if (!this.popup) {
            this.popup = new Popup(
                this.gantt.$popup_wrapper,
                this.gantt.options.popup,
                this.gantt,
            );
        }
        this.popup.show(options);
    }

    hide() {
        if (this.popup) this.popup.hide();
    }
}
