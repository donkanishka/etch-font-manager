/**
 * Etch Font Manager — in-builder Fonts panel.
 *
 * Registers a control in the Etch Settings Bar via the official
 * window.etchControls API and renders a docked panel that matches the
 * builder's own panel conventions.
 */
(function () {
	'use strict';

	var cfg = window.efmConfig;
	if (!cfg || window.__efmPanelBooted) {
		return;
	}

	// The builder can evaluate enqueued assets more than once while mounting.
	// A page-level guard prevents duplicate control IDs in Etch's keyed list.
	window.__efmPanelBooted = true;

	var t = cfg.i18n || {};
	var CONTROL_ID = 'efm-fonts';
	var state = {
		families: (cfg.state && cfg.state.families) || [],
		files: (cfg.state && cfg.state.files) || [],
		settings: (cfg.state && cfg.state.settings) || {},
		cssUrl: (cfg.state && cfg.state.cssUrl) || '',
		cssVersion: (cfg.state && cfg.state.cssVersion) || '',
		acssActive: !!(cfg.state && cfg.state.acssActive),
		tab: 'library',
		expanded: {},
		dirty: false,
		busy: '',
		status: null,
		query: '',
		results: [],
		searching: false
	};

	/* --------------------------------------------------------------------- */
	/* Helpers                                                                */
	/* --------------------------------------------------------------------- */

	function el(tag, attrs, children) {
		var node = document.createElement(tag);

		Object.keys(attrs || {}).forEach(function (key) {
			var value = attrs[key];
			if (value === null || value === undefined || value === false) {
				return;
			}
			if (key === 'class') {
				node.className = value;
			} else if (key === 'text') {
				node.textContent = value;
			} else if (key === 'html') {
				node.innerHTML = value;
			} else if (key.indexOf('on') === 0 && typeof value === 'function') {
				node.addEventListener(key.slice(2).toLowerCase(), value);
			} else if (key === 'style' && typeof value === 'object') {
				Object.keys(value).forEach(function (prop) {
					node.style.setProperty(prop, value[prop]);
				});
			} else {
				node.setAttribute(key, value === true ? '' : value);
			}
		});

		(children || []).forEach(function (child) {
			if (child === null || child === undefined || child === false) {
				return;
			}
			node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
		});

		return node;
	}

	var icons = {
		close: '<path d="M4 4l8 8M12 4l-8 8"/>',
		chevron: '<path d="M6 4l4 4-4 4"/>',
		trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8"/>',
		plus: '<path d="M8 3.5v9M3.5 8h9"/>',
		upload: '<path d="M8 11V3M5 6l3-3 3 3M3 12.5h10"/>',
		search: '<circle cx="7.2" cy="7.2" r="3.7"/><path d="M10.2 10.2L13 13"/>',
		check: '<path d="M3.5 8.5l3 3 6-7"/>',
		font: '<path d="M3 13l4.2-10h1.6L13 13M5.2 9.4h5.6"/>'
	};

	function icon(name, size) {
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('width', size || 14);
		svg.setAttribute('height', size || 14);
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '1.5');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
		svg.setAttribute('aria-hidden', 'true');
		svg.innerHTML = icons[name] || '';
		return svg;
	}

	function debounce(fn, wait) {
		var timer;
		return function () {
			var args = arguments;
			var self = this;
			clearTimeout(timer);
			timer = setTimeout(function () {
				fn.apply(self, args);
			}, wait);
		};
	}

	function plural(count, singular, many) {
		return count === 1 ? singular : many;
	}

	function formatSize(bytes) {
		if (!bytes) {
			return '';
		}
		return bytes > 1048576
			? (bytes / 1048576).toFixed(1) + ' MB'
			: Math.max(1, Math.round(bytes / 1024)) + ' KB';
	}

	/* --------------------------------------------------------------------- */
	/* REST                                                                   */
	/* --------------------------------------------------------------------- */

	function request(path, options) {
		options = options || {};

		var headers = { 'X-WP-Nonce': cfg.nonce };
		var body = options.body;

		if (body && !(body instanceof FormData)) {
			headers['Content-Type'] = 'application/json';
			body = JSON.stringify(body);
		}

		return fetch(cfg.root + path, {
			method: options.method || 'GET',
			credentials: 'same-origin',
			headers: headers,
			body: body
		}).then(function (response) {
			return response
				.json()
				.catch(function () {
					return null;
				})
				.then(function (data) {
					if (!response.ok) {
						var message = (data && data.message) || t.error;
						throw new Error(message);
					}
					return data;
				});
		});
	}

	function applyState(next) {
		if (!next) {
			return;
		}
		state.families = next.families || [];
		state.files = next.files || [];
		state.settings = next.settings || {};
		state.cssUrl = next.cssUrl || state.cssUrl;
		state.cssVersion = next.cssVersion || state.cssVersion;
		state.dirty = false;
		refreshFontCss();
	}

	/* --------------------------------------------------------------------- */
	/* Stylesheet refresh (builder shell + canvas iframes)                    */
	/* --------------------------------------------------------------------- */

	function collectDocuments() {
		var docs = [document];

		Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
			var doc = null;
			try {
				doc = frame.contentDocument;
			} catch (error) {
				doc = null;
			}
			if (doc && doc.head) {
				docs.push(doc);
			}
		});

		return docs;
	}

	function refreshFontCss() {
		if (!state.cssUrl) {
			return;
		}

		var href = state.cssUrl + '?ver=' + encodeURIComponent(state.cssVersion || Date.now());

		collectDocuments().forEach(function (doc) {
			var link = doc.getElementById('efm-fonts-css');

			if (!link) {
				link = Array.prototype.filter.call(
					doc.querySelectorAll('link[rel="stylesheet"]'),
					function (node) {
						return node.href && node.href.indexOf('efm-fonts.css') !== -1;
					}
				)[0];
			}

			if (link) {
				link.href = href;
				link.id = 'efm-fonts-css';
				return;
			}

			var created = doc.createElement('link');
			created.id = 'efm-fonts-css';
			created.rel = 'stylesheet';
			created.href = href;
			doc.head.appendChild(created);
		});
	}

	/* --------------------------------------------------------------------- */
	/* Panel shell                                                            */
	/* --------------------------------------------------------------------- */

	var panel = null;
	var bodyEl = null;
	var footerEl = null;
	var statusEl = null;
	var controlButton = null;
	var isOpen = false;

	function settingsBarWidth() {
		var bar = document.querySelector('.settings-bar');
		return bar ? Math.round(bar.getBoundingClientRect().width) : 47;
	}

	function buildPanel() {
		statusEl = el('div', { class: 'efm-status', role: 'status', 'aria-live': 'polite' });
		bodyEl = el('div', { class: 'efm-body' });
		footerEl = el('div', { class: 'efm-footer' });

		var tabs = ['library', 'add', 'theme'].map(function (key) {
			return el('button', {
				type: 'button',
				class: 'efm-tab',
				'data-tab': key,
				role: 'tab',
				text: t[key === 'add' ? 'add' : key] || key,
				onclick: function () {
					state.tab = key;
					render();
				}
			});
		});

		panel = el(
			'aside',
			{
				class: 'efm-panel',
				id: 'efm-panel',
				role: 'dialog',
				'aria-label': t.fonts || 'Fonts',
				'aria-hidden': 'true'
			},
			[
				el('header', { class: 'efm-header' }, [
					el('span', { class: 'efm-header__icon' }, [icon('font', 15)]),
					el('h2', { class: 'efm-title', text: t.fonts || 'Fonts' }),
					el('button', {
						type: 'button',
						class: 'efm-icon-btn',
						'aria-label': t.close || 'Close',
						title: t.close || 'Close',
						onclick: close
					}, [icon('close')])
				]),
				el('div', { class: 'efm-tabs', role: 'tablist' }, tabs),
				bodyEl,
				statusEl,
				footerEl
			]
		);

		panel.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
				event.stopPropagation();
				close();
			}
		});

		document.addEventListener('keydown', function (event) {
			if (isOpen && event.key === 'Escape' && panel.contains(document.activeElement)) {
				close();
			}
		});

		document.body.appendChild(panel);
	}

	function open() {
		if (!panel) {
			buildPanel();
		}

		isOpen = true;
		panel.style.setProperty('--efm-bar-width', settingsBarWidth() + 'px');
		panel.classList.add('is-open');
		panel.setAttribute('aria-hidden', 'false');

		if (controlButton) {
			controlButton.setAttribute('aria-expanded', 'true');
			controlButton.setAttribute('selected', 'true');
			controlButton.classList.add('efm-control--active');
		}

		render();
		refreshFontCss();

		var focusable = panel.querySelector('.efm-tab, button, input');
		if (focusable) {
			focusable.focus({ preventScroll: true });
		}
	}

	function close() {
		isOpen = false;

		if (panel) {
			panel.classList.remove('is-open');
			panel.setAttribute('aria-hidden', 'true');
		}

		if (controlButton) {
			controlButton.setAttribute('aria-expanded', 'false');
			controlButton.setAttribute('selected', 'false');
			controlButton.classList.remove('efm-control--active');
			controlButton.focus({ preventScroll: true });
		}
	}

	function toggle() {
		if (isOpen) {
			close();
		} else {
			open();
		}
	}

	function setStatus(message, type) {
		state.status = message ? { message: message, type: type || 'info' } : null;
		renderStatus();
	}

	function renderStatus() {
		if (!statusEl) {
			return;
		}

		statusEl.innerHTML = '';
		statusEl.classList.toggle('is-visible', !!state.status);

		if (!state.status) {
			return;
		}

		statusEl.classList.toggle('is-error', state.status.type === 'error');
		statusEl.appendChild(document.createTextNode(state.status.message));
	}

	function fail(error) {
		setStatus((error && error.message) || t.error, 'error');
	}

	/* --------------------------------------------------------------------- */
	/* Rendering                                                              */
	/* --------------------------------------------------------------------- */

	function render() {
		if (!panel) {
			return;
		}

		Array.prototype.forEach.call(panel.querySelectorAll('.efm-tab'), function (tab) {
			var active = tab.getAttribute('data-tab') === state.tab;
			tab.classList.toggle('is-active', active);
			tab.setAttribute('aria-selected', active ? 'true' : 'false');
		});

		var scroll = bodyEl.scrollTop;
		bodyEl.innerHTML = '';

		if (state.tab === 'library') {
			renderLibrary();
		} else if (state.tab === 'add') {
			renderAdd();
		} else {
			renderTheme();
		}

		bodyEl.scrollTop = scroll;
		renderFooter();
		renderStatus();
	}

	function renderFooter() {
		footerEl.innerHTML = '';
		footerEl.classList.toggle('is-visible', state.dirty);

		if (!state.dirty) {
			return;
		}

		footerEl.appendChild(el('span', { class: 'efm-footer__label', text: t.unsaved }));
		footerEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--ghost',
				text: t.discard,
				onclick: reload
			})
		);
		footerEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--primary',
				text: state.busy === 'save' ? t.saving : t.save,
				disabled: state.busy === 'save',
				onclick: saveFamilies
			})
		);
	}

	/* ------------------------------- Library ----------------------------- */

	function renderLibrary() {
		if (!state.families.length) {
			bodyEl.appendChild(
				el('div', { class: 'efm-empty' }, [
					el('p', { class: 'efm-empty__title', text: t.noFamilies }),
					el('p', { class: 'efm-empty__hint', text: t.noFamiliesHint }),
					el('button', {
						type: 'button',
						class: 'efm-btn efm-btn--primary',
						text: t.add,
						onclick: function () {
							state.tab = 'add';
							render();
						}
					})
				])
			);
			return;
		}

		var list = el('div', { class: 'efm-list' });

		state.families.forEach(function (family, index) {
			list.appendChild(renderFamily(family, index));
		});

		bodyEl.appendChild(list);
		bodyEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--ghost efm-btn--block',
				onclick: addFamily
			}, [icon('plus'), document.createTextNode(' ' + t.newFamily)])
		);
	}

	function renderFamily(family, index) {
		var expanded = !!state.expanded[index];
		var count = (family.variants || []).length;

		var head = el('div', { class: 'efm-item__head' }, [
			el('button', {
				type: 'button',
				class: 'efm-item__toggle' + (expanded ? ' is-expanded' : ''),
				'aria-expanded': expanded ? 'true' : 'false',
				onclick: function () {
					state.expanded[index] = !expanded;
					render();
				}
			}, [
				icon('chevron', 12),
				el('span', {
					class: 'efm-item__name',
					text: family.name,
					style: { 'font-family': '"' + family.name + '", sans-serif' }
				})
			]),
			el('span', {
				class: 'efm-item__meta',
				text: count + ' ' + plural(count, t.variant, t.variants)
			}),
			el('button', {
				type: 'button',
				class: 'efm-icon-btn efm-icon-btn--danger',
				'aria-label': t.removeFamily,
				title: t.removeFamily,
				onclick: function () {
					state.families.splice(index, 1);
					forgetExpanded(index);
					state.dirty = true;
					render();
				}
			}, [icon('trash')])
		]);

		var item = el('div', { class: 'efm-item' + (expanded ? ' is-expanded' : '') }, [head]);

		if (!expanded) {
			item.appendChild(
				el('p', {
					class: 'efm-item__preview',
					text: t.preview,
					style: { 'font-family': '"' + family.name + '", sans-serif' }
				})
			);
			return item;
		}

		var editor = el('div', { class: 'efm-item__body' });

		editor.appendChild(
			field(
				t.familyName,
				el('input', {
					type: 'text',
					class: 'efm-input',
					value: family.name,
					oninput: function (event) {
						state.families[index].name = event.target.value;
						state.dirty = true;
						renderFooter();
					}
				})
			)
		);

		(family.variants || []).forEach(function (variant, vi) {
			editor.appendChild(renderVariant(index, vi, variant));
		});

		editor.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--ghost efm-btn--block',
				onclick: function () {
					state.families[index].variants = state.families[index].variants || [];
					state.families[index].variants.push({
						file: state.files.length ? state.files[0].name : '',
						weight: '400',
						style: 'normal'
					});
					state.dirty = true;
					render();
				}
			}, [icon('plus', 12), document.createTextNode(' ' + t.addVariant)])
		);

		item.appendChild(editor);
		return item;
	}

	function renderVariant(familyIndex, variantIndex, variant) {
		var fileSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': t.file,
			onchange: function (event) {
				state.families[familyIndex].variants[variantIndex].file = event.target.value;
				state.dirty = true;
				renderFooter();
			}
		});

		if (!state.files.length) {
			fileSelect.appendChild(el('option', { value: '', text: t.noFiles }));
		}

		state.files.forEach(function (file) {
			fileSelect.appendChild(
				el('option', {
					value: file.name,
					text: file.name,
					selected: file.name === variant.file
				})
			);
		});

		var weightSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': t.weight,
			onchange: function (event) {
				state.families[familyIndex].variants[variantIndex].weight = event.target.value;
				state.dirty = true;
				renderFooter();
			}
		});

		['100', '200', '300', '400', '500', '600', '700', '800', '900', '100 900'].forEach(function (weight) {
			weightSelect.appendChild(
				el('option', {
					value: weight,
					text: weight === '100 900' ? 'variable' : weight,
					selected: weight === String(variant.weight)
				})
			);
		});

		var styleSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': t.style,
			onchange: function (event) {
				state.families[familyIndex].variants[variantIndex].style = event.target.value;
				state.dirty = true;
				renderFooter();
			}
		});

		[['normal', t.normal], ['italic', t.italic]].forEach(function (pair) {
			styleSelect.appendChild(
				el('option', {
					value: pair[0],
					text: pair[1],
					selected: pair[0] === variant.style
				})
			);
		});

		return el('div', { class: 'efm-variant' }, [
			fileSelect,
			el('div', { class: 'efm-variant__row' }, [
				weightSelect,
				styleSelect,
				el('button', {
					type: 'button',
					class: 'efm-icon-btn efm-icon-btn--danger',
					'aria-label': t.removeVariant,
					title: t.removeVariant,
					onclick: function () {
						state.families[familyIndex].variants.splice(variantIndex, 1);
						state.dirty = true;
						render();
					}
				}, [icon('trash', 12)])
			])
		]);
	}

	function field(label, control) {
		return el('label', { class: 'efm-field' }, [
			el('span', { class: 'efm-field__label', text: label }),
			control
		]);
	}

	/**
	 * Keep the expanded map aligned after a family is removed.
	 *
	 * @param {number} removed Index that was spliced out.
	 */
	function forgetExpanded(removed) {
		var next = {};

		Object.keys(state.expanded).forEach(function (key) {
			var index = parseInt(key, 10);
			if (index < removed) {
				next[index] = state.expanded[key];
			} else if (index > removed) {
				next[index - 1] = state.expanded[key];
			}
		});

		state.expanded = next;
	}

	function addFamily() {
		state.families.push({ name: t.newFamily, variants: [] });
		state.expanded[state.families.length - 1] = true;
		state.dirty = true;
		render();
	}

	function saveFamilies() {
		state.busy = 'save';
		renderFooter();

		request('/families', { method: 'POST', body: { families: state.families } })
			.then(function (next) {
				applyState(next);
				setStatus(t.saved);
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	function reload() {
		request('/state')
			.then(function (next) {
				applyState(next);
				render();
			})
			.catch(fail);
	}

	/* --------------------------------- Add ------------------------------- */

	function renderAdd() {
		var input = el('input', {
			type: 'file',
			accept: '.woff2,.woff,.ttf,.otf',
			multiple: true,
			class: 'efm-file-input',
			onchange: function (event) {
				uploadFiles(event.target.files);
				event.target.value = '';
			}
		});

		var dropzone = el('div', {
			class: 'efm-dropzone',
			tabindex: '0',
			role: 'button',
			'aria-label': t.upload,
			onclick: function () {
				input.click();
			},
			onkeydown: function (event) {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					input.click();
				}
			},
			ondragover: function (event) {
				event.preventDefault();
				dropzone.classList.add('is-dragover');
			},
			ondragleave: function () {
				dropzone.classList.remove('is-dragover');
			},
			ondrop: function (event) {
				event.preventDefault();
				dropzone.classList.remove('is-dragover');
				uploadFiles(event.dataTransfer.files);
			}
		}, [
			icon('upload', 18),
			el('p', { class: 'efm-dropzone__title', text: t.upload }),
			el('p', { class: 'efm-dropzone__hint', text: t.uploadHint }),
			input
		]);

		bodyEl.appendChild(dropzone);

		/* Uploaded files */
		bodyEl.appendChild(el('h3', { class: 'efm-section-title', text: t.files }));

		if (!state.files.length) {
			bodyEl.appendChild(el('p', { class: 'efm-muted', text: t.noFiles }));
		} else {
			var files = el('ul', { class: 'efm-files' });

			state.files.forEach(function (file) {
				files.appendChild(
					el('li', { class: 'efm-file' }, [
						el('span', { class: 'efm-file__name', text: file.name, title: file.name }),
						el('span', { class: 'efm-file__meta', text: formatSize(file.size) }),
						el('button', {
							type: 'button',
							class: 'efm-icon-btn efm-icon-btn--danger',
							'aria-label': t.deleteFile,
							title: t.deleteFile,
							onclick: function () {
								if (!window.confirm(t.confirmDelete)) {
									return;
								}
								deleteFile(file.name);
							}
						}, [icon('trash', 12)])
					])
				);
			});

			bodyEl.appendChild(files);
		}

		/* Google Fonts */
		bodyEl.appendChild(el('h3', { class: 'efm-section-title', text: t.googleFonts }));

		var search = el('input', {
			type: 'search',
			class: 'efm-input',
			placeholder: t.searchGoogle,
			value: state.query,
			oninput: debounce(function (event) {
				state.query = event.target.value;
				searchGoogle();
			}, 320)
		});

		bodyEl.appendChild(el('div', { class: 'efm-search' }, [icon('search', 13), search]));

		if (state.searching) {
			bodyEl.appendChild(el('p', { class: 'efm-muted', text: t.searching }));
			return;
		}

		if (state.query && !state.results.length) {
			bodyEl.appendChild(el('p', { class: 'efm-muted', text: t.noResults }));
			return;
		}

		if (!state.results.length) {
			return;
		}

		loadGooglePreview(state.results);

		var results = el('div', { class: 'efm-results' });

		state.results.forEach(function (font) {
			var installed = state.families.some(function (family) {
				return family.name.toLowerCase() === font.family.toLowerCase();
			});

			results.appendChild(
				el('div', { class: 'efm-result' }, [
					el('div', { class: 'efm-result__head' }, [
						el('span', { class: 'efm-result__name', text: font.family }),
						installed
							? el('span', { class: 'efm-result__badge' }, [icon('check', 11), document.createTextNode(' ' + t.installed)])
							: el('button', {
								type: 'button',
								class: 'efm-btn efm-btn--primary efm-btn--xs',
								text: state.busy === 'install:' + font.family ? t.installing : t.install,
								disabled: state.busy.indexOf('install:') === 0,
								onclick: function () {
									installGoogleFont(font.family);
								}
							})
					]),
					el('p', {
						class: 'efm-result__preview',
						text: t.preview,
						style: { 'font-family': '"' + font.family + '", sans-serif' }
					}),
					el('span', {
						class: 'efm-result__meta',
						text: font.category + ' · ' + (font.variants || []).length + ' ' + plural((font.variants || []).length, t.variant, t.variants)
					})
				])
			);
		});

		bodyEl.appendChild(results);
	}

	function uploadFiles(fileList) {
		var files = Array.prototype.slice.call(fileList || []);
		if (!files.length) {
			return;
		}

		setStatus(t.uploading);

		var chain = Promise.resolve();

		files.forEach(function (file) {
			chain = chain.then(function () {
				var form = new FormData();
				form.append('file', file);

				return request('/upload', { method: 'POST', body: form }).then(function (result) {
					applyState(result && result.state);
				});
			});
		});

		chain
			.then(function () {
				setStatus(t.uploaded + ' · ' + files.length);
			})
			.catch(fail)
			.then(render);
	}

	function deleteFile(filename) {
		request('/files/delete', { method: 'POST', body: { filename: filename } })
			.then(function (next) {
				applyState(next);
				render();
			})
			.catch(fail);
	}

	function searchGoogle() {
		if (!state.query) {
			state.results = [];
			render();
			return;
		}

		state.searching = true;
		render();

		request('/google/search?query=' + encodeURIComponent(state.query))
			.then(function (data) {
				state.results = (data && data.results) || [];
			})
			.catch(fail)
			.then(function () {
				state.searching = false;
				render();
			});
	}

	function loadGooglePreview(fonts) {
		var families = fonts
			.slice(0, 12)
			.map(function (font) {
				return 'family=' + encodeURIComponent(font.family);
			})
			.join('&');

		var link = document.getElementById('efm-google-preview');

		if (!link) {
			link = document.createElement('link');
			link.id = 'efm-google-preview';
			link.rel = 'stylesheet';
			document.head.appendChild(link);
		}

		link.href = 'https://fonts.googleapis.com/css2?' + families + '&display=swap';
	}

	function installGoogleFont(family) {
		state.busy = 'install:' + family;
		setStatus(t.installing + ' ' + family);
		render();

		request('/google/install', { method: 'POST', body: { family: family } })
			.then(function (data) {
				applyState(data && data.state);
				setStatus(t.installed + ' · ' + family);
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	/* -------------------------------- Theme ------------------------------ */

	function renderTheme() {
		bodyEl.appendChild(el('h3', { class: 'efm-section-title', text: t.acssMapping }));
		bodyEl.appendChild(el('p', { class: 'efm-muted', text: t.acssHint }));

		if (!state.acssActive) {
			bodyEl.appendChild(el('p', { class: 'efm-notice', text: t.acssMissing }));
		}

		bodyEl.appendChild(field(t.headingFont, familySelect('heading_font')));
		bodyEl.appendChild(field(t.textFont, familySelect('text_font')));

		bodyEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--primary efm-btn--block',
				text: state.busy === 'settings' ? t.saving : t.save,
				disabled: state.busy === 'settings',
				onclick: saveSettings
			})
		);
	}

	function familySelect(key) {
		var select = el('select', {
			class: 'efm-input efm-input--select',
			onchange: function (event) {
				state.settings[key] = event.target.value;
			}
		});

		select.appendChild(el('option', { value: '', text: t.none, selected: !state.settings[key] }));

		state.families.forEach(function (family) {
			select.appendChild(
				el('option', {
					value: family.name,
					text: family.name,
					selected: state.settings[key] === family.name
				})
			);
		});

		return select;
	}

	function saveSettings() {
		state.busy = 'settings';
		render();

		request('/settings', {
			method: 'POST',
			body: {
				heading_font: state.settings.heading_font || '',
				text_font: state.settings.text_font || '',
				acss_enabled: true
			}
		})
			.then(function (next) {
				applyState(next);
				setStatus(t.saved);
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	/* --------------------------------------------------------------------- */
	/* Settings Bar control                                                   */
	/* --------------------------------------------------------------------- */

	var registered = false;

	function sectionFor(placement) {
		if (placement.indexOf('top') === 0) {
			return 'top';
		}
		if (placement.indexOf('center') === 0) {
			return 'center';
		}
		return 'bottom';
	}

	function topLevelNode(node, container) {
		var current = node;
		while (current && current.parentElement !== container) {
			current = current.parentElement;
		}
		return current;
	}

	/**
	 * The Settings Bar must be mounted before a control is registered.
	 * Registering earlier makes Etch's keyed control list throw
	 * (svelte each_key_duplicate), which stops every custom control from
	 * rendering, including controls owned by other plugins.
	 *
	 * @return {boolean} True once the bar is mounted and the API is present.
	 */
	function settingsBarReady() {
		var controls = window.etchControls;
		var placement = cfg.placement || 'after-dark-mode';
		var section = sectionFor(placement === 'after-dark-mode' ? 'bottom' : placement);
		var container = document.querySelector('.settings-bar__section.' + section);

		return !!(
			controls &&
			controls.builder &&
			controls.builder.settingsBar &&
			controls.builder.settingsBar[section] &&
			container &&
			container.querySelector('button')
		);
	}

	/**
	 * Etch 1.6.4 can expose a live control store while failing to render any
	 * external controls. ACSS gives us a reliable feature test: if its control
	 * is registered but its source icon is absent after mount, adding another
	 * API control would only leave another invisible store entry.
	 *
	 * @return {boolean}
	 */
	function controlsRendererUnavailable() {
		var bottom = window.etchControls && window.etchControls.builder && window.etchControls.builder.settingsBar.bottom;
		var registered = bottom && bottom.before && bottom.before.some(function (control) {
			return control.id === 'acss-dashboard-button';
		});

		return !!(
			window.ACSS_API &&
			(window.ACSS_API.appLoaded !== false) &&
			registered &&
			!document.querySelector('[data-acss-source-icon]')
		);
	}

	/**
	 * Render a native-shaped button when Etch's public control store is present
	 * but its Svelte renderer is not consuming that store. This path does not
	 * mutate Etch's store and is used only after the feature test above fails.
	 *
	 * @return {boolean}
	 */
	function registerFallbackControl() {
		if (registered) {
			return false;
		}

		var container = document.querySelector('.settings-bar__section.bottom');
		var darkModeButton = container && container.querySelector('button');

		if (!container || !darkModeButton) {
			return false;
		}

		controlButton = el('button', {
			type: 'button',
			class: 'etch-builder-button etch-builder-button--icon-placement-before etch-builder-button--variant-icon efm-control',
			'data-button-root': 'true',
			'data-efm-fallback': 'true',
			'aria-label': t.fonts || 'Fonts',
			'aria-expanded': 'false',
			'aria-controls': 'efm-panel',
			title: t.fonts || 'Fonts',
			style: {
				'--button-font-size': 'var(--e-font-size-m)',
				'--icon-rotation': '0deg'
			},
			onclick: toggle
		}, [
			el('div', { class: 'icon-wrapper' }, [icon('font', 14)])
		]);

		darkModeButton.after(controlButton);
		registered = true;

		return true;
	}

	function registerControl() {
		if (registered || !settingsBarReady()) {
			return false;
		}

		var placement = cfg.placement || 'after-dark-mode';
		var section = sectionFor(placement === 'after-dark-mode' ? 'bottom' : placement);
		var api = window.etchControls.builder.settingsBar[section];
		var container = document.querySelector('.settings-bar__section.' + section);
		var before = Array.prototype.slice.call(container.querySelectorAll('button'));
		var useEnd = placement.indexOf('-end') !== -1;

		// Etch stores controls before rendering them. Never call add twice: a
		// duplicate id crashes its keyed Svelte list. Observe the single call
		// until the corresponding button appears instead.
		registered = true;

		try {
			(useEnd ? api.addAfter : api.addBefore).call(api, {
				id: CONTROL_ID,
				icon: cfg.icon || 'ph:text-aa-duotone',
				tooltip: t.fonts || 'Fonts',
				callback: toggle
			});
		} catch (error) {
			registered = false;
			return false;
		}

		var finished = false;
		var observer;

		var finish = function () {
			if (finished) {
				return true;
			}

			var buttons = Array.prototype.slice.call(container.querySelectorAll('button'));
			controlButton = buttons.filter(function (button) {
				return before.indexOf(button) === -1;
			})[0];

			if (!controlButton) {
				return false;
			}

			finished = true;
			if (observer) {
				observer.disconnect();
			}

			controlButton.setAttribute('aria-expanded', 'false');
			controlButton.setAttribute('aria-controls', 'efm-panel');
			controlButton.classList.add('efm-control');

			if (placement === 'after-dark-mode') {
				pinAfterDarkMode(container, buttons, before);
			}

			return true;
		};

		if (!finish()) {
			observer = new MutationObserver(finish);
			observer.observe(container, { childList: true, subtree: true });
			window.setTimeout(function () {
				if (observer) {
					observer.disconnect();
				}
			}, 5000);
		}

		return true;
	}

	/**
	 * The Controls API can only prepend or append within a section, so the
	 * control is moved once to sit directly after the dark mode toggle and is
	 * re-pinned if the builder re-renders the section.
	 */
	function pinAfterDarkMode(scope, buttonsAfter, buttonsBefore) {
		var index = buttonsAfter.indexOf(controlButton);
		var anchor = buttonsBefore[index];

		if (!anchor || !scope.contains(anchor)) {
			return;
		}

		var ourNode = topLevelNode(controlButton, scope);
		var anchorNode = topLevelNode(anchor, scope);

		if (!ourNode || !anchorNode || ourNode === anchorNode) {
			return;
		}

		var moving = false;

		var place = function () {
			if (moving || !scope.contains(ourNode) || !scope.contains(anchorNode)) {
				return;
			}
			if (anchorNode.nextElementSibling === ourNode) {
				return;
			}
			moving = true;
			anchorNode.after(ourNode);
			window.setTimeout(function () {
				moving = false;
			}, 0);
		};

		place();

		var observer = new MutationObserver(place);
		observer.observe(scope, { childList: true });
	}

	function boot() {
		var attempts = 0;

		var timer = window.setInterval(function () {
			attempts += 1;

			if (settingsBarReady()) {
				window.clearInterval(timer);

				// Allow third-party controls (notably ACSS) to finish registering,
				// then choose the official API or the guarded DOM fallback.
				window.setTimeout(function () {
					if (controlsRendererUnavailable()) {
						registerFallbackControl();
					} else {
						registerControl();
					}
					refreshFontCss();
				}, 1200);
				return;
			}

			if (attempts > 160) {
				window.clearInterval(timer);
			}
		}, 250);
	}

	if (document.readyState === 'complete') {
		boot();
	} else {
		window.addEventListener('load', boot);
	}
})();
