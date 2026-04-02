
if (!customElements.get('product-form')) {
  customElements.define('product-form', class ProductForm extends HTMLElement {
    constructor() {
      super();

      this.form = this.querySelector('form');
      this.form.querySelector('[name=id]').disabled = false;
      this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
      this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
      this.submitButton = this.querySelector('[type="submit"]');
      if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');
      
      // Check for RADCam custom cart drawer
      this.radcamCartDrawer = document.getElementById('cartDrawer');
      if (this.radcamCartDrawer) this.submitButton.setAttribute('aria-haspopup', 'dialog');

      this.hideErrors = this.dataset.hideErrors === 'true';
    }

    onSubmitHandler(evt) {
      evt.preventDefault();
      if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

      this.handleErrorMessage();

      this.submitButton.setAttribute('aria-disabled', true);
      this.submitButton.classList.add('loading');
      this.querySelector('.loading-overlay__spinner').classList.remove('hidden');

      const config = fetchConfig('javascript');
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
      delete config.headers['Content-Type'];

      const formData = new FormData(this.form);
      
      // For RADCam custom cart drawer, request the header section
      if (this.radcamCartDrawer) {
        formData.append('sections', 'header');
        formData.append('sections_url', window.location.pathname);
      } else if (this.cart) {
        formData.append('sections', this.cart.getSectionsToRender().map((section) => section.id));
        formData.append('sections_url', window.location.pathname);
        this.cart.setActiveElement(document.activeElement);
      }
    
      // Added to generate selling plan add to cart response
      if (typeof window.getCurrentSellingPlanId === 'function') {
        const sellingPlanId = window.getCurrentSellingPlanId();
        if (sellingPlanId) {
          formData.append("selling_plan", sellingPlanId);
        }
      }
      
      config.body = formData;

      fetch(`${routes.cart_add_url}`, config)
        .then((response) => response.json())
        .then((response) => {
          if (response.status) {
            publish(PUB_SUB_EVENTS.cartError, {source: 'product-form', productVariantId: formData.get('id'), errors: response.description, message: response.message});
            this.handleErrorMessage(response.description);

            const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
            if (!soldOutMessage) return;
            this.submitButton.setAttribute('aria-disabled', true);
            this.submitButton.querySelector('span').classList.add('hidden');
            soldOutMessage.classList.remove('hidden');
            this.error = true;
            return;
          }
          
          // Handle RADCam custom cart drawer
          if (this.radcamCartDrawer && typeof window.openCartDrawer === 'function') {
            if (!this.error) publish(PUB_SUB_EVENTS.cartUpdate, {source: 'product-form', productVariantId: formData.get('id')});
            this.error = false;
            // Update cart drawer content using section rendering response
            this.updateRadcamCartDrawer(response);
            window.openCartDrawer();
            return;
          }
          
          if (!this.cart) {
            window.location = window.routes.cart_url;
            return;
          }

          if (!this.error) publish(PUB_SUB_EVENTS.cartUpdate, {source: 'product-form', productVariantId: formData.get('id')});
          this.error = false;
          const quickAddModal = this.closest('quick-add-modal');
          if (quickAddModal) {
            document.body.addEventListener('modalClosed', () => {
              setTimeout(() => { this.cart.renderContents(response) });
            }, { once: true });
            quickAddModal.hide(true);
          } else {
            this.cart.renderContents(response);
          }
        })
        .catch((e) => {
          console.error(e);
        })
        .finally(() => {
          this.submitButton.classList.remove('loading');
          if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
          if (!this.error) this.submitButton.removeAttribute('aria-disabled');
          this.querySelector('.loading-overlay__spinner').classList.add('hidden');
        });
    }
    
    updateRadcamCartDrawer(response) {
      // Use section rendering response from the cart add API
      if (response.sections && response.sections.header) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(response.sections.header, 'text/html');
        
        // Update cart drawer body content
        const newCartDrawerBody = doc.querySelector('.radcam-cart-drawer__body');
        const currentCartDrawerBody = document.querySelector('.radcam-cart-drawer__body');
        if (newCartDrawerBody && currentCartDrawerBody) {
          currentCartDrawerBody.innerHTML = newCartDrawerBody.innerHTML;
        }
        
        // Update cart drawer footer
        const newCartDrawerFooter = doc.querySelector('.radcam-cart-drawer__footer');
        const currentCartDrawer = document.getElementById('cartDrawer');
        const currentCartDrawerFooter = currentCartDrawer.querySelector('.radcam-cart-drawer__footer');
        
        if (newCartDrawerFooter) {
          if (currentCartDrawerFooter) {
            currentCartDrawerFooter.outerHTML = newCartDrawerFooter.outerHTML;
          } else {
            currentCartDrawer.appendChild(newCartDrawerFooter.cloneNode(true));
          }
        } else if (currentCartDrawerFooter) {
          currentCartDrawerFooter.remove();
        }
        
        // Update cart drawer title with new count
        const newCartTitle = doc.querySelector('.radcam-cart-drawer__title');
        const currentCartTitle = document.querySelector('.radcam-cart-drawer__title');
        if (newCartTitle && currentCartTitle) {
          currentCartTitle.textContent = newCartTitle.textContent;
        }
        
        // Update cart count badge in header
        const newCartBadge = doc.querySelector('.radcam-cart-count__badge');
        const currentCartCount = document.querySelector('.radcam-cart-count');
        const currentCartBadge = currentCartCount?.querySelector('.radcam-cart-count__badge');
        
        if (newCartBadge) {
          if (currentCartBadge) {
            currentCartBadge.textContent = newCartBadge.textContent;
          } else if (currentCartCount) {
            const badge = document.createElement('span');
            badge.className = 'radcam-cart-count__badge';
            badge.textContent = newCartBadge.textContent;
            currentCartCount.appendChild(badge);
          }
        }
      } else {
        // Fallback: use the global update function if section rendering didn't work
        if (typeof window.updateRadcamCartDrawer === 'function') {
          window.updateRadcamCartDrawer();
        }
      }
    }

    handleErrorMessage(errorMessage = false) {
      if (this.hideErrors) return;

      this.errorMessageWrapper = this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
      if (!this.errorMessageWrapper) return;
      this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

      this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

      if (errorMessage) {
        this.errorMessage.textContent = errorMessage;
      }
    }
  });
}
