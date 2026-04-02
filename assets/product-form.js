
if (!customElements.get('product-form')) {
  customElements.define('product-form', class ProductForm extends HTMLElement {
    constructor() {
      super();

      this.form = this.querySelector('form');
      this.form.querySelector('[name=id]').disabled = false;
      this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
      this.submitButton = this.querySelector('[type="submit"]');
      
      // Use RADCam custom cart drawer
      this.cartDrawer = document.getElementById('cartDrawer');
      if (this.cartDrawer) this.submitButton.setAttribute('aria-haspopup', 'dialog');

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
      
      // Request header section for RADCam cart drawer updates
      formData.append('sections', 'header');
      formData.append('sections_url', window.location.pathname);
    
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
          
          if (!this.error) publish(PUB_SUB_EVENTS.cartUpdate, {source: 'product-form', productVariantId: formData.get('id')});
          this.error = false;
          
          // Update and open RADCam cart drawer
          this.updateCartDrawer(response);
          if (typeof window.openCartDrawer === 'function') {
            window.openCartDrawer();
          }
        })
        .catch((e) => {
          console.error(e);
        })
        .finally(() => {
          this.submitButton.classList.remove('loading');
          if (!this.error) this.submitButton.removeAttribute('aria-disabled');
          this.querySelector('.loading-overlay__spinner').classList.add('hidden');
        });
    }
    
    updateCartDrawer(response) {
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
        const currentCartDrawerFooter = currentCartDrawer?.querySelector('.radcam-cart-drawer__footer');
        
        if (newCartDrawerFooter) {
          if (currentCartDrawerFooter) {
            currentCartDrawerFooter.outerHTML = newCartDrawerFooter.outerHTML;
          } else if (currentCartDrawer) {
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
      } else if (typeof window.updateRadcamCartDrawer === 'function') {
        window.updateRadcamCartDrawer();
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
