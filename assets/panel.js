/**
 * Etch Font Manager — full-screen font manager for the Etch builder.
 *
 * Registers a control in the Etch Settings Bar through the official
 * window.etchControls API and opens a full-screen manager that follows Etch's
 * own manager conventions: takeover surface beside the settings bar, a 40px
 * header and a 256px inner navigation column.
 *
 * The manager is mounted on document.body and never inserts nodes into Etch's
 * own Svelte-managed DOM.
 */
(function () {
	'use strict';

	var cfg = window.efmConfig;
	if (!cfg || window.__efmBooted) {
		return;
	}
	window.__efmBooted = true;

	var t = cfg.i18n || {};
	var CONTROL_ID = 'efm-fonts';

	function s(key, fallback) {
		return t[key] || fallback;
	}

	var state = {
		families: (cfg.state && cfg.state.families) || [],
		files: (cfg.state && cfg.state.files) || [],
		settings: (cfg.state && cfg.state.settings) || {},
		cssUrl: (cfg.state && cfg.state.cssUrl) || '',
		cssVersion: (cfg.state && cfg.state.cssVersion) || '',
		acssActive: !!(cfg.state && cfg.state.acssActive),
		view: 'library',
		editing: null,
		filter: '',
		query: '',
		results: [],
		searching: false,
		category: '',
		sort: 'popularity',
		categories: [],
		total: 0,
		loadingMore: false,
		variable: {},
		importMode: 'replace',
		importReport: null,
		busy: '',
		status: null,
		dirty: false,
		subsets: {},
		previewText: s('preview', 'The quick brown fox'),
		previewSize: 30
	};

	/* --------------------------------------------------------------------- */
	/* DOM helpers                                                            */
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

	var PATHS = {
		back: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
		plus: '<path d="M8 3.5v9M3.5 8h9"/>',
		trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8"/>',
		upload: '<path d="M8 11V3M5 6l3-3 3 3M3 12.5h10"/>',
		search: '<circle cx="7.2" cy="7.2" r="3.7"/><path d="M10.2 10.2L13 13"/>',
		check: '<path d="M3.5 8.5l3 3 6-7"/>',
		library: '<path d="M3 3.5h3v9H3zM7 3.5h3v9H7zM11.2 4l2 8.5"/>',
		palette: '<circle cx="8" cy="8" r="5.5"/><circle cx="6" cy="6.4" r=".9" fill="currentColor" stroke="none"/><circle cx="10" cy="6.4" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="10.4" r=".9" fill="currentColor" stroke="none"/>',
		google: '<circle cx="8" cy="8" r="5.5"/><path d="M2.6 8h10.8M8 2.6c1.6 1.7 2.4 3.5 2.4 5.4S9.6 11.7 8 13.4C6.4 11.7 5.6 9.9 5.6 8S6.4 4.3 8 2.6z"/>'
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
		svg.innerHTML = PATHS[name] || '';
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

	function formatSize(bytes) {
		if (!bytes) {
			return '';
		}
		return bytes > 1048576
			? (bytes / 1048576).toFixed(1) + ' MB'
			: Math.max(1, Math.round(bytes / 1024)) + ' KB';
	}

	function plural(count, one, many) {
		return count === 1 ? one : many;
	}

	function familyStack(name) {
		return name ? '"' + name + '", sans-serif' : 'inherit';
	}

	/**
	 * Where a family is assigned, so destructive actions can warn first.
	 *
	 * @param {string} name Family name.
	 * @return {string[]} Human readable roles.
	 */
	function familyRoles(name) {
		var roles = [];
		var lower = (name || '').toLowerCase();

		if (lower && (state.settings.heading_font || '').toLowerCase() === lower) {
			roles.push(s('headingFont', 'Heading font'));
		}
		if (lower && (state.settings.text_font || '').toLowerCase() === lower) {
			roles.push(s('textFont', 'Text font'));
		}

		return roles;
	}

	/**
	 * Families that map a given file, so deleting it can warn first.
	 *
	 * @param {string} filename File name.
	 * @return {string[]} Family names.
	 */
	function fileUsedBy(filename) {
		return state.families.filter(function (family) {
			return (family.variants || []).some(function (variant) {
				return variant.file === filename;
			});
		}).map(function (family) {
			return family.name;
		});
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
			return response.json().catch(function () {
				return null;
			}).then(function (data) {
				if (!response.ok) {
					throw new Error((data && data.message) || s('error', 'Something went wrong.'));
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
	/* Stylesheet refresh                                                     */
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

	/**
	 * Etch renders the canvas stylesheet list from a keyed each block, so the
	 * link element it owns is only ever updated in place (href only) and is
	 * never replaced or renamed.
	 */
	function refreshFontCss() {
		if (!state.cssUrl) {
			return;
		}

		var href = state.cssUrl + '?ver=' + encodeURIComponent(state.cssVersion || Date.now());

		collectDocuments().forEach(function (doc) {
			var owned = doc.getElementById('efm-fonts-live');

			var etchOwned = Array.prototype.filter.call(
				doc.querySelectorAll('link[rel="stylesheet"]'),
				function (node) {
					return node !== owned && node.href && node.href.indexOf('efm-fonts.css') !== -1;
				}
			)[0];

			if (etchOwned) {
				etchOwned.href = href;
				return;
			}

			if (owned) {
				owned.href = href;
				return;
			}

			var created = doc.createElement('link');
			created.id = 'efm-fonts-live';
			created.rel = 'stylesheet';
			created.href = href;
			doc.head.appendChild(created);
		});
	}

	/* --------------------------------------------------------------------- */
	/* Shell                                                                  */
	/* --------------------------------------------------------------------- */

	var manager = null;
	var contentEl = null;
	var navEl = null;
	var headerActionsEl = null;
	var statusEl = null;
	var controlButton = null;
	var isOpen = false;
	var lastFocus = null;

	var VIEWS = [
		{ key: 'library', icon: 'library', label: function () { return s('library', 'Library'); } },
		{ key: 'upload', icon: 'upload', label: function () { return s('upload', 'Upload fonts'); } },
		{ key: 'google', icon: 'google', label: function () { return s('googleFonts', 'Google Fonts'); } },
		{ key: 'theme', icon: 'palette', label: function () { return s('theme', 'Theme'); } },
		{ key: 'tools', icon: 'file', label: function () { return s('tools', 'Import & export'); } }
	];

	function build() {
		navEl = el('nav', { class: 'efm-nav', 'aria-label': s('fonts', 'Fonts') });
		contentEl = el('div', { class: 'efm-content' });
		headerActionsEl = el('div', { class: 'efm-header__actions' });
		statusEl = el('span', { class: 'efm-status', role: 'status', 'aria-live': 'polite' });

		manager = el('section', {
			class: 'efm-manager',
			id: 'efm-manager',
			role: 'dialog',
			'aria-label': s('fonts', 'Fonts'),
			hidden: true
		}, [
			el('header', { class: 'efm-header' }, [
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline efm-btn--icon',
					'aria-label': s('close', 'Close'),
					title: s('close', 'Close'),
					onclick: close
				}, [icon('back')]),
				el('h1', { class: 'efm-header__title', text: s('fonts', 'Fonts') }),
				statusEl,
				headerActionsEl
			]),
			el('div', { class: 'efm-body' }, [navEl, contentEl])
		]);

		manager.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
				event.stopPropagation();
				close();
				return;
			}

			if (event.key !== 'Tab') {
				return;
			}

			// The manager covers the builder, so keyboard focus stays inside it.
			var focusable = Array.prototype.filter.call(
				manager.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
				function (node) {
					return node.offsetParent !== null;
				}
			);

			if (!focusable.length) {
				return;
			}

			var first = focusable[0];
			var last = focusable[focusable.length - 1];

			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		});

		window.addEventListener('resize', function () {
			if (isOpen) {
				syncBounds();
			}
		});

		document.body.appendChild(manager);
	}

	/**
	 * Etch's managers stop above the element bar at the bottom of the builder.
	 * The gap is measured from the settings bar so the manager lines up with
	 * whatever chrome Etch is currently showing.
	 */
	function syncBounds() {
		if (!manager) {
			return;
		}

		var bar = document.querySelector('.settings-bar');
		var gap = 48;

		if (bar) {
			gap = Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().bottom));
		}

		manager.style.setProperty('--efm-inset-bottom', gap + 'px');
	}

	function open() {
		if (!manager) {
			build();
		}

		lastFocus = document.activeElement;
		isOpen = true;
		manager.hidden = false;
		manager.classList.add('is-open');
		syncBounds();

		if (controlButton) {
			controlButton.setAttribute('aria-expanded', 'true');
			controlButton.setAttribute('selected', 'true');
		}

		render();
		refreshFontCss();

		var focusable = manager.querySelector('.efm-nav__item');
		if (focusable) {
			focusable.focus({ preventScroll: true });
		}
	}

	function close() {
		if (state.dirty && !window.confirm(s('confirmDiscard', 'You have unsaved font changes. Close and discard them?'))) {
			return;
		}

		if (state.dirty) {
			state.dirty = false;
			reload();
		}

		isOpen = false;

		if (manager) {
			manager.classList.remove('is-open');
			manager.hidden = true;
		}

		if (controlButton) {
			controlButton.setAttribute('aria-expanded', 'false');
			controlButton.setAttribute('selected', 'false');
		}

		if (lastFocus && lastFocus.focus) {
			lastFocus.focus({ preventScroll: true });
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

		if (message && type !== 'error') {
			window.clearTimeout(setStatus._timer);
			setStatus._timer = window.setTimeout(function () {
				state.status = null;
				renderStatus();
			}, 4000);
		}
	}

	function renderStatus() {
		if (!statusEl) {
			return;
		}
		statusEl.textContent = state.status ? state.status.message : '';
		statusEl.classList.toggle('is-error', !!state.status && state.status.type === 'error');
	}

	function fail(error) {
		setStatus((error && error.message) || s('error', 'Something went wrong.'), 'error');
	}

	function go(view) {
		state.view = view;
		state.editing = null;
		render();

		// Opening Google Fonts browses the library straight away rather than
		// waiting for a search term.
		if ('google' === view && !state.results.length && !state.searching) {
			searchGoogle();
		}
	}

	/* --------------------------------------------------------------------- */
	/* Render                                                                 */
	/* --------------------------------------------------------------------- */

	function render() {
		if (!manager) {
			return;
		}

		renderNav();
		renderHeaderActions();
		renderStatus();

		contentEl.innerHTML = '';

		if (state.editing !== null && state.families[state.editing]) {
			renderFamilyEditor(state.editing);
		} else if (state.view === 'library') {
			renderLibrary();
		} else if (state.view === 'upload') {
			renderUpload();
		} else if (state.view === 'google') {
			renderGoogle();
		} else if (state.view === 'tools') {
			renderTools();
		} else {
			renderTheme();
		}
	}

	function renderNav() {
		navEl.innerHTML = '';
		navEl.appendChild(el('span', { class: 'efm-nav__label', text: s('manage', 'Manage') }));

		VIEWS.forEach(function (view) {
			var active = state.view === view.key && state.editing === null;

			navEl.appendChild(
				el('button', {
					type: 'button',
					class: 'efm-nav__item' + (active ? ' is-active' : ''),
					'aria-current': active ? 'true' : 'false',
					onclick: function () {
						go(view.key);
					}
				}, [icon(view.icon, 14), el('span', { text: view.label() })])
			);
		});

		var variantCount = state.families.reduce(function (total, family) {
			return total + (family.variants || []).length;
		}, 0);

		navEl.appendChild(
			el('div', { class: 'efm-nav__meta' }, [
				el('span', { text: state.families.length + ' ' + plural(state.families.length, s('familyLabel', 'family'), s('familiesLabel', 'families')) }),
				el('span', { text: variantCount + ' ' + plural(variantCount, s('variant', 'variant'), s('variants', 'variants')) }),
				el('span', { text: state.files.length + ' ' + plural(state.files.length, s('fileLabel', 'file'), s('filesLabel', 'files')) })
			])
		);
	}

	function renderHeaderActions() {
		headerActionsEl.innerHTML = '';

		if (!state.dirty) {
			return;
		}

		headerActionsEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				text: s('discard', 'Discard'),
				onclick: reload
			})
		);
		headerActionsEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--primary',
				text: state.busy === 'save' ? s('saving', 'Saving…') : s('save', 'Save changes'),
				disabled: state.busy === 'save',
				onclick: saveFamilies
			})
		);
	}

	/* ------------------------------ Toolbar ------------------------------ */

	function previewToolbar(lead) {
		var sizeLabel = el('span', { class: 'efm-toolbar__size', text: state.previewSize + 'px' });

		var textInput = el('input', {
			type: 'text',
			class: 'efm-input',
			value: state.previewText,
			'aria-label': s('previewText', 'Preview text'),
			placeholder: s('previewText', 'Preview text'),
			oninput: debounce(function (event) {
				state.previewText = event.target.value;
				Array.prototype.forEach.call(contentEl.querySelectorAll('[data-efm-specimen]'), function (node) {
					node.textContent = state.previewText || s('preview', 'The quick brown fox');
				});
			}, 160)
		});

		var size = el('input', {
			type: 'range',
			class: 'efm-range',
			min: '14',
			max: '72',
			step: '1',
			value: String(state.previewSize),
			'aria-label': s('previewSize', 'Preview size'),
			oninput: function (event) {
				state.previewSize = parseInt(event.target.value, 10);
				sizeLabel.textContent = state.previewSize + 'px';
				Array.prototype.forEach.call(contentEl.querySelectorAll('[data-efm-specimen]'), function (node) {
					node.style.fontSize = state.previewSize + 'px';
				});
			}
		});

		return el('div', { class: 'efm-toolbar' }, [
			lead || null,
			el('div', { class: 'efm-toolbar__preview' }, [textInput, size, sizeLabel])
		]);
	}

	function specimen(family) {
		return el('p', {
			class: 'efm-specimen',
			'data-efm-specimen': 'true',
			text: state.previewText || s('preview', 'The quick brown fox'),
			style: { 'font-family': familyStack(family), 'font-size': state.previewSize + 'px' }
		});
	}

	function emptyState(title, hint, cta, onCta) {
		return el('div', { class: 'efm-empty' }, [
			el('p', { class: 'efm-empty__title', text: title }),
			el('p', { class: 'efm-empty__hint', text: hint }),
			cta ? el('button', { type: 'button', class: 'efm-btn efm-btn--primary', text: cta, onclick: onCta }) : null
		]);
	}

	/* ------------------------------ Library ------------------------------ */

	function renderLibrary() {
		var search = el('input', {
			type: 'search',
			class: 'efm-input',
			placeholder: s('filterFamilies', 'Filter families'),
			value: state.filter,
			oninput: debounce(function (event) {
				state.filter = event.target.value;
				render();
			}, 200)
		});

		contentEl.appendChild(previewToolbar(
			el('div', { class: 'efm-toolbar__lead' }, [
				el('div', { class: 'efm-search' }, [icon('search', 13), search]),
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline',
					onclick: addFamily
				}, [icon('plus', 12), el('span', { text: s('newFamily', 'New family') })])
			])
		));

		if (!state.families.length) {
			contentEl.appendChild(emptyState(
				s('noFamilies', 'No font families yet.'),
				s('noFamiliesHint', 'Upload a font file or install one from Google Fonts.'),
				s('googleFonts', 'Google Fonts'),
				function () { go('google'); }
			));
			return;
		}

		var needle = state.filter.trim().toLowerCase();
		var list = state.families
			.map(function (family, index) { return { family: family, index: index }; })
			.filter(function (row) {
				return !needle || (row.family.name || '').toLowerCase().indexOf(needle) !== -1;
			});

		if (!list.length) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noMatches', 'No families match that filter.') }));
			return;
		}

		var grid = el('div', { class: 'efm-grid' });

		list.forEach(function (row) {
			var family = row.family;
			var variants = family.variants || [];
			var weights = variants.map(function (v) { return v.weight; }).filter(function (w, i, arr) { return arr.indexOf(w) === i; }).sort();
			var roles = familyRoles(family.name);
			var subsetList = variants.map(function (v) { return v.subset; }).filter(function (sub, i, arr) {
				return sub && arr.indexOf(sub) === i;
			}).sort();

			grid.appendChild(
				el('article', { class: 'efm-card' }, [
					el('div', { class: 'efm-card__head' }, [
						el('h2', { class: 'efm-card__title', text: family.name }),
						el('div', { class: 'efm-card__actions' }, [
							el('button', {
								type: 'button',
								class: 'efm-btn efm-btn--outline efm-btn--sm',
								text: s('manageFamily', 'Manage'),
								onclick: function () {
									state.editing = row.index;
									render();
								}
							}),
							el('button', {
								type: 'button',
								class: 'efm-icon-btn efm-icon-btn--danger',
								'aria-label': s('removeFamily', 'Remove family'),
								title: s('removeFamily', 'Remove family'),
								onclick: function () {
									var roles = familyRoles(family.name);

									if (roles.length && !window.confirm(
										s('confirmRemoveAssigned', 'This family is assigned as:') + ' ' + roles.join(', ') + '.\n' +
										s('confirmRemoveAssignedHint', 'Removing it will clear that assignment. Continue?')
									)) {
										return;
									}

									state.families.splice(row.index, 1);
									state.dirty = true;
									render();
								}
							}, [icon('trash', 13)])
						])
					]),
					specimen(family.name),
					roles.length ? el('div', { class: 'efm-chips' }, roles.map(function (role) {
						return el('span', { class: 'efm-chip efm-chip--role', text: role });
					})) : null,
					subsetList.length ? el('div', { class: 'efm-chips' }, subsetList.map(function (sub) {
						return el('span', { class: 'efm-chip', text: sub });
					})) : null,
					el('div', { class: 'efm-card__meta' }, [
						el('span', { text: variants.length + ' ' + plural(variants.length, s('variant', 'variant'), s('variants', 'variants')) }),
						el('span', { class: 'efm-weights', text: weights.join(' · ') || '—' })
					])
				])
			);
		});

		contentEl.appendChild(grid);
	}

	function renderFamilyEditor(index) {
		var family = state.families[index];
		var variants = family.variants || [];

		contentEl.appendChild(
			el('div', { class: 'efm-breadcrumb' }, [
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--outline efm-btn--icon',
					'aria-label': s('back', 'Back'),
					title: s('back', 'Back'),
					onclick: function () {
						state.editing = null;
						render();
					}
				}, [icon('back', 13)]),
				el('h2', { class: 'efm-breadcrumb__title', text: family.name })
			])
		);

		contentEl.appendChild(previewToolbar(null));
		contentEl.appendChild(specimen(family.name));

		contentEl.appendChild(
			el('label', { class: 'efm-field' }, [
				el('span', { class: 'efm-field__label', text: s('familyName', 'Family name') }),
				el('input', {
					type: 'text',
					class: 'efm-input',
					value: family.name,
					oninput: function (event) {
						state.families[index].name = event.target.value;
						state.dirty = true;
						renderHeaderActions();
					}
				})
			])
		);

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('delivery', 'Delivery') }));
		contentEl.appendChild(deliverySection(index));

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('variants', 'variants') }));

		if (!variants.length) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noVariants', 'No variants mapped yet.') }));
		} else {
			var table = el('div', { class: 'efm-table' }, [
				el('div', { class: 'efm-table__head' }, [
					el('span', { text: s('file', 'File') }),
					el('span', { text: s('weight', 'Weight') }),
					el('span', { text: s('style', 'Style') }),
					el('span', { text: '' })
				])
			]);

			variants.forEach(function (variant, vi) {
				table.appendChild(variantRow(index, vi, variant));
			});

			contentEl.appendChild(table);
		}

		contentEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				onclick: function () {
					state.families[index].variants = state.families[index].variants || [];
					var used = (state.families[index].variants || []).map(function (v) { return v.file; });
					var next = state.files.filter(function (f) { return used.indexOf(f.name) === -1; })[0] || state.files[0];

					state.families[index].variants.push({
						file: next ? next.name : '',
						weight: next && next.weight ? next.weight : '400',
						style: next && next.style ? next.style : 'normal'
					});
					state.dirty = true;
					render();
				}
			}, [icon('plus', 12), el('span', { text: s('addVariant', 'Add variant') })])
		);
	}

	/**
	 * How a family is delivered: loading behaviour, preload and fallback stack.
	 *
	 * @param {number} index Family index.
	 * @return {HTMLElement}
	 */
	function deliverySection(index) {
		var family = state.families[index];

		var displaySelect = el('select', {
			class: 'efm-input efm-input--select',
			onchange: function (event) {
				state.families[index].display = event.target.value;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		['swap', 'optional', 'fallback', 'block', 'auto'].forEach(function (value) {
			displaySelect.appendChild(el('option', {
				value: value,
				text: value,
				selected: value === (family.display || 'swap')
			}));
		});

		var stackInput = el('input', {
			type: 'text',
			class: 'efm-input',
			list: 'efm-stacks',
			placeholder: 'sans-serif',
			value: family.fallback || '',
			oninput: function (event) {
				state.families[index].fallback = event.target.value;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		var stacks = el('datalist', { id: 'efm-stacks' });
		[
			'system-ui, sans-serif',
			'Arial, Helvetica, sans-serif',
			'Georgia, "Times New Roman", serif',
			'ui-monospace, SFMono-Regular, monospace'
		].forEach(function (value) {
			stacks.appendChild(el('option', { value: value }));
		});

		var preloadInput = el('input', {
			type: 'checkbox',
			class: 'efm-checkbox',
			checked: !!family.preload,
			onchange: function (event) {
				state.families[index].preload = event.target.checked;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		return el('div', { class: 'efm-delivery' }, [
			stacks,
			el('div', { class: 'efm-fields' }, [
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('fontDisplay', 'Loading behaviour') }),
					displaySelect,
					el('span', { class: 'efm-field__hint', text: s('fontDisplayHint', 'swap shows a fallback until the font arrives. optional skips the font entirely on slow connections, which removes layout shift.') })
				]),
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('fallbackStack', 'Fallback stack') }),
					stackInput,
					el('span', { class: 'efm-field__hint', text: s('fallbackHint', 'Shown while the font loads, and if it fails. A close match reduces layout shift.') })
				])
			]),
			el('label', { class: 'efm-toggle' }, [
				preloadInput,
				el('span', {}, [
					el('span', { class: 'efm-toggle__label', text: s('preload', 'Preload this family') }),
					el('span', { class: 'efm-field__hint', text: s('preloadHint', 'Fetches the regular weight early. Use it only for fonts visible above the fold; preloading everything slows the page down.') })
				])
			])
		]);
	}

	function variantRow(familyIndex, variantIndex, variant) {
		var fileSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('file', 'File'),
			onchange: function (event) {
				var target = state.families[familyIndex].variants[variantIndex];
				var picked = state.files.filter(function (f) { return f.name === event.target.value; })[0];

				target.file = event.target.value;

				// Weight and style are read from the file name so mapping a
				// freshly uploaded file is a single step.
				if (picked && picked.weight) {
					target.weight = picked.weight;
					target.style = picked.style || 'normal';
				}

				state.dirty = true;
				render();
			}
		});

		if (!state.files.length) {
			fileSelect.appendChild(el('option', { value: '', text: s('noFiles', 'No files uploaded yet.') }));
		}

		state.files.forEach(function (file) {
			fileSelect.appendChild(el('option', {
				value: file.name,
				text: file.name,
				selected: file.name === variant.file
			}));
		});

		var weightSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('weight', 'Weight'),
			onchange: function (event) {
				state.families[familyIndex].variants[variantIndex].weight = event.target.value;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		['100', '200', '300', '400', '500', '600', '700', '800', '900', '100 900'].forEach(function (weight) {
			weightSelect.appendChild(el('option', {
				value: weight,
				text: weight === '100 900' ? s('variable', 'variable') : weight,
				selected: weight === String(variant.weight)
			}));
		});

		var styleSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('style', 'Style'),
			onchange: function (event) {
				state.families[familyIndex].variants[variantIndex].style = event.target.value;
				state.dirty = true;
				renderHeaderActions();
			}
		});

		[['normal', s('normal', 'Normal')], ['italic', s('italic', 'Italic')]].forEach(function (pair) {
			styleSelect.appendChild(el('option', {
				value: pair[0],
				text: pair[1],
				selected: pair[0] === variant.style
			}));
		});

		return el('div', { class: 'efm-table__row' }, [
			fileSelect,
			weightSelect,
			styleSelect,
			el('button', {
				type: 'button',
				class: 'efm-icon-btn efm-icon-btn--danger',
				'aria-label': s('removeVariant', 'Remove variant'),
				title: s('removeVariant', 'Remove variant'),
				onclick: function () {
					state.families[familyIndex].variants.splice(variantIndex, 1);
					state.dirty = true;
					render();
				}
			}, [icon('trash', 13)])
		]);
	}

	/* ------------------------------- Upload ------------------------------ */

	function renderUpload() {
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
			'aria-label': s('upload', 'Upload font files'),
			onclick: function () { input.click(); },
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
			ondragleave: function () { dropzone.classList.remove('is-dragover'); },
			ondrop: function (event) {
				event.preventDefault();
				dropzone.classList.remove('is-dragover');
				uploadFiles(event.dataTransfer.files);
			}
		}, [
			icon('upload', 22),
			el('p', { class: 'efm-dropzone__title', text: s('upload', 'Upload font files') }),
			el('p', { class: 'efm-dropzone__hint', text: s('uploadHint', 'Drop woff2, woff, ttf or otf files here, or click to browse.') }),
			input
		]);

		contentEl.appendChild(dropzone);
		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('files', 'Uploaded files') }));

		if (!state.files.length) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noFiles', 'No files uploaded yet.') }));
			return;
		}

		var table = el('div', { class: 'efm-table efm-table--files' }, [
			el('div', { class: 'efm-table__head' }, [
				el('span', { text: s('file', 'File') }),
				el('span', { text: s('type', 'Type') }),
				el('span', { text: s('size', 'Size') }),
				el('span', { text: '' })
			])
		]);

		state.files.forEach(function (file) {
			table.appendChild(
				el('div', { class: 'efm-table__row' }, [
					el('span', { class: 'efm-file__name', text: file.name, title: file.name }),
					el('span', { class: 'efm-muted', text: (file.ext || '').toUpperCase() + ' · ' + (file.weight || '400') + (file.style === 'italic' ? ' ' + s('italic', 'Italic') : '') }),
					el('span', { class: 'efm-muted', text: formatSize(file.size) + (fileUsedBy(file.name).length ? ' · ' + s('inUse', 'in use') : '') }),
					el('button', {
						type: 'button',
						class: 'efm-icon-btn efm-icon-btn--danger',
						'aria-label': s('deleteFile', 'Delete file'),
						title: s('deleteFile', 'Delete file'),
						onclick: function () {
							var users = fileUsedBy(file.name);
							var message = s('confirmDelete', 'Delete this file from the fonts folder?');

							if (users.length) {
								message += '\n\n' + s('confirmDeleteUsed', 'It is mapped by:') + ' ' + users.join(', ') +
									'.\n' + s('confirmDeleteUsedHint', 'Those variants will be removed too.');
							}

							if (window.confirm(message)) {
								deleteFile(file.name);
							}
						}
					}, [icon('trash', 13)])
				])
			);
		});

		contentEl.appendChild(table);
	}

	/* ---------------------------- Google Fonts --------------------------- */

	function renderGoogle() {
		var search = el('input', {
			type: 'search',
			class: 'efm-input',
			placeholder: s('searchGoogle', 'Search Google Fonts'),
			value: state.query,
			oninput: debounce(function (event) {
				state.query = event.target.value;
				searchGoogle();
			}, 320)
		});

		var categorySelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('category', 'Category'),
			onchange: function (event) {
				state.category = event.target.value;
				searchGoogle();
			}
		}, [el('option', { value: '', text: s('allCategories', 'All categories'), selected: !state.category })]);

		state.categories.forEach(function (cat) {
			categorySelect.appendChild(el('option', { value: cat, text: cat, selected: state.category === cat }));
		});

		var sortSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('sortBy', 'Sort by'),
			onchange: function (event) {
				state.sort = event.target.value;
				searchGoogle();
			}
		}, [
			el('option', { value: 'popularity', text: s('sortPopular', 'Most popular'), selected: state.sort === 'popularity' }),
			el('option', { value: 'alphabetical', text: s('sortAlpha', 'A to Z'), selected: state.sort === 'alphabetical' })
		]);

		contentEl.appendChild(previewToolbar(
			el('div', { class: 'efm-toolbar__lead' }, [
				el('div', { class: 'efm-search' }, [icon('search', 13), search]),
				categorySelect,
				sortSelect
			])
		));

		if (state.searching) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('searching', 'Searching…') }));
			return;
		}

		if (!state.results.length) {
			contentEl.appendChild(el('p', { class: 'efm-muted', text: s('noResults', 'No fonts found.') }));
			return;
		}

		contentEl.appendChild(el('p', {
			class: 'efm-muted',
			text: state.results.length + ' / ' + state.total + ' ' + s('familiesLabel', 'families')
		}));

		var grid = el('div', { class: 'efm-grid' });

		state.results.forEach(function (font) {
			var installed = state.families.some(function (family) {
				return (family.name || '').toLowerCase() === font.family.toLowerCase();
			});
			var busy = state.busy === 'install:' + font.family;
			var available = font.subsets && font.subsets.length ? font.subsets : ['latin'];
			var chosen = selectedSubsets(font);
			var hasVariable = !!(font.wght && font.wght.min);
			var useVariable = hasVariable && state.variable[font.family] !== false;

			grid.appendChild(
				el('article', { class: 'efm-card', 'data-family': font.family }, [
					el('div', { class: 'efm-card__head' }, [
						el('h2', { class: 'efm-card__title', text: font.family }),
						el('div', { class: 'efm-card__actions' }, [
							installed ? el('span', { class: 'efm-badge' }, [icon('check', 11), el('span', { text: s('installed', 'Installed') })]) : null,
							el('button', {
								type: 'button',
								class: 'efm-btn efm-btn--sm ' + (installed ? 'efm-btn--outline' : 'efm-btn--primary'),
								text: busy
									? s('installing', 'Installing…')
									: (installed ? s('reinstall', 'Reinstall') : s('install', 'Install')),
								disabled: state.busy.indexOf('install:') === 0 || !chosen.length,
								onclick: function () { installGoogleFont(font.family, chosen, useVariable); }
							})
						])
					]),
					el('p', {
						class: 'efm-specimen',
						'data-efm-specimen': 'true',
						text: state.previewText || s('preview', 'The quick brown fox'),
						style: { 'font-family': familyStack(font.family), 'font-size': state.previewSize + 'px' }
					}),
					hasVariable ? el('label', { class: 'efm-toggle efm-toggle--inline' }, [
						el('input', {
							type: 'checkbox',
							class: 'efm-checkbox',
							checked: useVariable,
							onchange: function (event) {
								state.variable[font.family] = event.target.checked;
								render();
							}
						}),
						el('span', {}, [
							el('span', { class: 'efm-toggle__label', text: s('variableCut', 'Variable') }),
							el('span', {
								class: 'efm-field__hint',
								text: font.wght.min + '–' + font.wght.max + ' · ' + s('variableHint', 'one file per subset instead of one per weight')
							})
						])
					]) : null,
					available.length > 1 ? el('div', { class: 'efm-subsets' }, [
						el('span', { class: 'efm-subsets__label', text: s('subsets', 'Subsets') }),
						el('div', { class: 'efm-chips' }, available.map(function (sub) {
							var on = chosen.indexOf(sub) !== -1;

							return el('button', {
								type: 'button',
								class: 'efm-chip efm-chip--toggle' + (on ? ' is-on' : ''),
								'aria-pressed': on ? 'true' : 'false',
								text: sub,
								onclick: function () {
									toggleSubset(font, sub);
								}
							});
						}))
					]) : null,
					el('div', { class: 'efm-card__meta' }, [
						el('span', { text: font.category || '' }),
						el('span', { text: (font.variants || []).length + ' ' + plural((font.variants || []).length, s('variant', 'variant'), s('variants', 'variants')) })
					])
				])
			);
		});

		contentEl.appendChild(grid);
		observePreviews(grid);

		if (state.results.length < state.total) {
			contentEl.appendChild(
				el('button', {
					type: 'button',
					class: 'efm-btn efm-btn--ghost efm-btn--block',
					text: state.loadingMore ? s('loading', 'Loading…') : s('loadMore', 'Load more'),
					disabled: state.loadingMore,
					onclick: loadMoreGoogle
				})
			);
		}
	}

	/**
	 * Subsets chosen for a family. Latin is preselected because it carries the
	 * numerals and punctuation most scripts still rely on.
	 *
	 * @param {object} font Search result.
	 * @return {string[]}
	 */
	function selectedSubsets(font) {
		if (!state.subsets[font.family]) {
			var available = font.subsets && font.subsets.length ? font.subsets : ['latin'];
			state.subsets[font.family] = available.filter(function (sub) {
				return sub === 'latin';
			});

			if (!state.subsets[font.family].length) {
				state.subsets[font.family] = available.slice(0, 1);
			}
		}

		return state.subsets[font.family];
	}

	function toggleSubset(font, subset) {
		var chosen = selectedSubsets(font);
		var at = chosen.indexOf(subset);

		if (at === -1) {
			chosen.push(subset);
		} else {
			chosen.splice(at, 1);
		}

		render();
	}

	var previewed = {};
	var previewQueue = [];
	var previewObserver = null;

	/**
	 * Load specimen webfonts only for cards that are actually on screen.
	 *
	 * Requesting every result up front pulled a stylesheet for two dozen
	 * families whether or not they were ever seen, which is slow and wasteful
	 * once the library can be browsed rather than only searched.
	 *
	 * @param {HTMLElement} grid Result grid.
	 */
	function observePreviews(grid) {
		if (!('IntersectionObserver' in window)) {
			queuePreviews(state.results.map(function (font) { return font.family; }));
			return;
		}

		if (previewObserver) {
			previewObserver.disconnect();
		}

		previewObserver = new IntersectionObserver(function (entries) {
			var families = [];

			entries.forEach(function (entry) {
				if (!entry.isIntersecting) {
					return;
				}

				families.push(entry.target.getAttribute('data-family'));
				previewObserver.unobserve(entry.target);
			});

			if (families.length) {
				queuePreviews(families);
			}
		}, { root: contentEl, rootMargin: '200px' });

		Array.prototype.forEach.call(grid.querySelectorAll('[data-family]'), function (card) {
			previewObserver.observe(card);
		});
	}

	function queuePreviews(families) {
		var fresh = families.filter(function (family) {
			return family && !previewed[family];
		});

		if (!fresh.length) {
			return;
		}

		fresh.forEach(function (family) {
			previewed[family] = true;
			previewQueue.push(family);
		});

		window.clearTimeout(queuePreviews._timer);
		queuePreviews._timer = window.setTimeout(flushPreviews, 120);
	}

	function flushPreviews() {
		var batch = previewQueue.splice(0, previewQueue.length);

		if (!batch.length) {
			return;
		}

		var link = document.createElement('link');
		link.rel = 'stylesheet';
		link.className = 'efm-google-preview';
		link.href = 'https://fonts.googleapis.com/css2?' + batch.map(function (family) {
			return 'family=' + encodeURIComponent(family);
		}).join('&') + '&display=swap';

		document.head.appendChild(link);
	}

	/* -------------------------------- Theme ------------------------------ */

	function renderTheme() {
		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('acssMapping', 'Automatic.css mapping') }));
		contentEl.appendChild(el('p', { class: 'efm-muted', text: s('acssHint', 'Maps the selected families to --heading-font-family and --text-font-family.') }));

		if (!state.acssActive) {
			contentEl.appendChild(el('p', { class: 'efm-notice', text: s('acssMissing', 'Automatic.css was not detected. The variables are still written.') }));
		}

		contentEl.appendChild(
			el('div', { class: 'efm-fields' }, [
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('headingFont', 'Heading font') }),
					familySelect('heading_font')
				]),
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('textFont', 'Text font') }),
					familySelect('text_font')
				])
			])
		);

		contentEl.appendChild(
			el('div', { class: 'efm-sample' }, [
				el('p', {
					class: 'efm-sample__heading',
					text: s('sampleHeading', 'Typography that ships'),
					style: { 'font-family': familyStack(state.settings.heading_font) }
				}),
				el('p', {
					class: 'efm-sample__body',
					text: s('sampleBody', 'Body copy renders in the text family. Upload a font or install one from Google Fonts, map its weights, then assign it here.'),
					style: { 'font-family': familyStack(state.settings.text_font) }
				})
			])
		);

		contentEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--primary',
				text: state.busy === 'settings' ? s('saving', 'Saving…') : s('save', 'Save changes'),
				disabled: state.busy === 'settings',
				onclick: saveSettings
			})
		);
	}

	/* -------------------------------- Tools ------------------------------ */

	function renderTools() {
		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('exportTitle', 'Export') }));
		contentEl.appendChild(el('p', { class: 'efm-muted', text: s('exportHint', 'Download every family, variant mapping and assignment as a JSON file. Font files are not included; a family installed from Google can be reinstalled on the other site.') }));
		contentEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--primary',
				text: state.busy === 'export' ? s('loading', 'Loading…') : s('exportButton', 'Download configuration'),
				disabled: state.busy === 'export',
				onclick: exportConfig
			})
		);

		contentEl.appendChild(el('h3', { class: 'efm-section-title', text: s('importTitle', 'Import') }));
		contentEl.appendChild(el('p', { class: 'efm-muted', text: s('importHint', 'Load a configuration exported from another site.') }));

		var modeSelect = el('select', {
			class: 'efm-input efm-input--select',
			'aria-label': s('importMode', 'Import mode'),
			onchange: function (event) {
				state.importMode = event.target.value;
			}
		}, [
			el('option', { value: 'replace', text: s('importReplace', 'Replace everything'), selected: state.importMode !== 'merge' }),
			el('option', { value: 'merge', text: s('importMerge', 'Merge with existing families'), selected: state.importMode === 'merge' })
		]);

		var fileInput = el('input', {
			type: 'file',
			accept: '.json,application/json',
			class: 'efm-file-input',
			onchange: function (event) {
				var file = event.target.files && event.target.files[0];
				event.target.value = '';

				if (file) {
					importConfig(file);
				}
			}
		});

		contentEl.appendChild(
			el('div', { class: 'efm-fields' }, [
				el('label', { class: 'efm-field' }, [
					el('span', { class: 'efm-field__label', text: s('importMode', 'Import mode') }),
					modeSelect
				])
			])
		);

		contentEl.appendChild(
			el('button', {
				type: 'button',
				class: 'efm-btn efm-btn--outline',
				text: state.busy === 'import' ? s('loading', 'Loading…') : s('importButton', 'Choose a file…'),
				disabled: state.busy === 'import',
				onclick: function () { fileInput.click(); }
			})
		);
		contentEl.appendChild(fileInput);

		if (state.importReport) {
			var report = state.importReport;
			var lines = [
				el('p', { class: 'efm-muted', text: report.families + ' ' + plural(report.families, s('familyLabel', 'family'), s('familiesLabel', 'families')) + ' ' + s('imported', 'imported') })
			];

			if (report.missing && report.missing.length) {
				lines.push(el('p', { class: 'efm-notice', text: s('importMissing', 'These files are referenced but not present in the fonts folder. Upload them, or reinstall the family from Google Fonts:') }));
				lines.push(el('ul', { class: 'efm-files' }, report.missing.map(function (name) {
					return el('li', { class: 'efm-file' }, [el('span', { class: 'efm-file__name', text: name })]);
				})));
			}

			contentEl.appendChild(el('div', { class: 'efm-report' }, lines));
		}
	}

	function exportConfig() {
		state.busy = 'export';
		render();

		request('/export')
			.then(function (data) {
				var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
				var url = URL.createObjectURL(blob);
				var link = document.createElement('a');

				link.href = url;
				link.download = 'etch-fonts-' + new Date().toISOString().slice(0, 10) + '.json';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

				setStatus(s('exported', 'Configuration downloaded.'));
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	function importConfig(file) {
		state.busy = 'import';
		render();

		var reader = new FileReader();

		reader.onload = function () {
			var payload;

			try {
				payload = JSON.parse(reader.result);
			} catch (error) {
				state.busy = '';
				fail(new Error(s('importInvalid', 'That file is not valid JSON.')));
				render();
				return;
			}

			request('/import', { method: 'POST', body: { data: payload, mode: state.importMode || 'replace' } })
				.then(function (result) {
					applyState(result && result.state);
					state.importReport = (result && result.report) || null;
					setStatus(s('imported', 'imported'));
				})
				.catch(fail)
				.then(function () {
					state.busy = '';
					render();
				});
		};

		reader.onerror = function () {
			state.busy = '';
			fail(new Error(s('error', 'Something went wrong.')));
			render();
		};

		reader.readAsText(file);
	}

	function familySelect(key) {
		var select = el('select', {
			class: 'efm-input efm-input--select',
			onchange: function (event) {
				state.settings[key] = event.target.value;
				render();
			}
		});

		select.appendChild(el('option', { value: '', text: s('none', 'None'), selected: !state.settings[key] }));

		state.families.forEach(function (family) {
			select.appendChild(el('option', {
				value: family.name,
				text: family.name,
				selected: state.settings[key] === family.name
			}));
		});

		return select;
	}

	/* ------------------------------- Actions ----------------------------- */

	function addFamily() {
		state.families.push({ name: s('newFamily', 'New family'), variants: [], display: 'swap', preload: false, fallback: '' });
		state.editing = state.families.length - 1;
		state.dirty = true;
		render();
	}

	function saveFamilies() {
		state.busy = 'save';
		renderHeaderActions();

		request('/families', { method: 'POST', body: { families: state.families } })
			.then(function (next) {
				applyState(next);
				setStatus(s('saved', 'Fonts saved.'));
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
	}

	function reload() {
		request('/state').then(function (next) {
			applyState(next);
			state.editing = null;
			render();
		}).catch(fail);
	}

	function uploadFiles(fileList) {
		var files = Array.prototype.slice.call(fileList || []);
		if (!files.length) {
			return;
		}

		setStatus(s('uploading', 'Uploading…'));

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

		chain.then(function () {
			setStatus(s('uploaded', 'Uploaded') + ' · ' + files.length);
		}).catch(fail).then(render);
	}

	function deleteFile(filename) {
		request('/files/delete', { method: 'POST', body: { filename: filename } })
			.then(function (next) {
				applyState(next);
				render();
			})
			.catch(fail);
	}

	function googleQuery(offset) {
		return '/google/search?query=' + encodeURIComponent(state.query) +
			'&category=' + encodeURIComponent(state.category) +
			'&sort=' + encodeURIComponent(state.sort) +
			'&limit=24&offset=' + offset;
	}

	function searchGoogle() {
		state.searching = true;
		render();

		request(googleQuery(0))
			.then(function (data) {
				state.results = (data && data.results) || [];
				state.total = (data && data.total) || 0;

				if (data && data.categories && data.categories.length) {
					state.categories = data.categories;
				}
			})
			.catch(fail)
			.then(function () {
				state.searching = false;
				render();
			});
	}

	function loadMoreGoogle() {
		state.loadingMore = true;
		render();

		request(googleQuery(state.results.length))
			.then(function (data) {
				state.results = state.results.concat((data && data.results) || []);
				state.total = (data && data.total) || state.total;
			})
			.catch(fail)
			.then(function () {
				state.loadingMore = false;
				render();
			});
	}

	function installGoogleFont(family, subsets, variable) {
		state.busy = 'install:' + family;
		setStatus(s('installing', 'Installing…') + ' ' + family);
		render();

		request('/google/install', {
			method: 'POST',
			body: { family: family, subsets: subsets || ['latin'], variable: !!variable }
		})
			.then(function (data) {
				applyState(data && data.state);
				setStatus(s('installed', 'Installed') + ' · ' + family);
			})
			.catch(fail)
			.then(function () {
				state.busy = '';
				render();
			});
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
				setStatus(s('saved', 'Fonts saved.'));
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

	function placement() {
		var value = cfg.placement || 'top-end';

		// Legacy value, mapped to a supported API position.
		if (value === 'after-dark-mode') {
			value = 'bottom-start';
		}

		var section = value.indexOf('top') === 0 ? 'top' : (value.indexOf('center') === 0 ? 'center' : 'bottom');

		return { section: section, atEnd: value.indexOf('-end') !== -1 };
	}

	function settingsBarReady() {
		var controls = window.etchControls;
		var target = placement().section;
		var container = document.querySelector('.settings-bar__section.' + target);

		return !!(
			controls &&
			controls.builder &&
			controls.builder.settingsBar &&
			controls.builder.settingsBar[target] &&
			container &&
			container.querySelector('button')
		);
	}

	function registerControl() {
		if (registered || !settingsBarReady()) {
			return false;
		}

		var target = placement();
		var api = window.etchControls.builder.settingsBar[target.section];
		var container = document.querySelector('.settings-bar__section.' + target.section);
		var before = Array.prototype.slice.call(container.querySelectorAll('button'));

		// Etch stores controls before rendering them, and its list is keyed by
		// id, so the control is registered exactly once.
		registered = true;

		try {
			(target.atEnd ? api.addAfter : api.addBefore).call(api, {
				id: CONTROL_ID,
				icon: cfg.icon || 'ph:text-aa-duotone',
				tooltip: s('fonts', 'Fonts'),
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
				return;
			}

			var buttons = Array.prototype.slice.call(container.querySelectorAll('button'));
			controlButton = buttons.filter(function (button) {
				return before.indexOf(button) === -1;
			})[0];

			if (!controlButton) {
				return;
			}

			finished = true;
			if (observer) {
				observer.disconnect();
			}

			controlButton.setAttribute('aria-expanded', 'false');
			controlButton.setAttribute('aria-controls', 'efm-manager');
			controlButton.classList.add('efm-control');
		};

		finish();

		if (!finished) {
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

	function boot() {
		var attempts = 0;

		var timer = window.setInterval(function () {
			attempts += 1;

			if (settingsBarReady()) {
				window.clearInterval(timer);

				// Let third-party controls register first.
				window.setTimeout(function () {
					registerControl();
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
