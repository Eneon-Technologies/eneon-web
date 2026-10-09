/* Eneon admin: photo/video uploads straight to Cloudinary.
 *
 * Editors don't need a Cloudinary account: the Cloudinary upload widget uses an *unsigned
 * upload preset* (Cloudinary → Settings → Upload → Upload presets). The preset name, cloud name
 * and folder come from `media_library.config` in /admin/config.yml. The uploaded file's URL is
 * saved into the field; the site build adds the right size and crop for each place it is shown.
 */
(function () {
  const MB = 1024 * 1024;

  const eneonCloudinary = {
    name: 'eneon-cloudinary',
    init: async ({ options = {}, handleInsert } = {}) => {
      const config = options.config || {};
      return {
        show: ({ allowMultiple } = {}) => {
          if (!window.cloudinary) {
            alert('The Cloudinary uploader could not load. Check your internet connection and reload the page.');
            return;
          }
          const multiple = allowMultiple === true;
          const uploaded = [];
          const widget = window.cloudinary.createUploadWidget({
            cloudName: config.cloud_name,
            uploadPreset: config.upload_preset,
            folder: config.folder,
            sources: ['local', 'camera', 'url'],
            multiple,
            maxFiles: multiple ? 20 : 1,
            clientAllowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'mp4', 'mov', 'webm', 'm4v'],
            maxImageFileSize: 10 * MB,
            maxVideoFileSize: 100 * MB,
            showAdvancedOptions: false,
            cropping: false,
            showPoweredBy: false,
            styles: {
              palette: {
                window: '#0B1730', windowBorder: '#2B3E63', tabIcon: '#22D3FF', menuIcons: '#A9B8D0',
                textDark: '#060D1F', textLight: '#EAF1FB', link: '#22D3FF', action: '#1A86F5',
                inactiveTabIcon: '#7F90AD', error: '#FF6B72', inProgress: '#22D3FF', complete: '#4ADE80',
                sourceBg: '#060D1F'
              }
            }
          }, (error, result) => {
            if (error) {
              console.error('Cloudinary upload error', error);
              return;
            }
            if (result.event === 'success') uploaded.push(result.info.secure_url);
            if (result.event === 'queues-end' && uploaded.length) {
              handleInsert(multiple ? uploaded.slice() : uploaded[0]);
              widget.close({ quiet: true });
            }
          });
          widget.open();
        },
        hide: () => {},
        enableStandalone: () => false
      };
    }
  };

  CMS.registerMediaLibrary(eneonCloudinary);
  CMS.init();
})();
