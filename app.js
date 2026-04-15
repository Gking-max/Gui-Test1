// CineSearch Pro - Simple, Clean, Production Ready

class CineSearchPro {
    constructor() {
        // State
        this.searchCache = new Map();
        this.currentResults = [];
        this.currentAbortController = null;
        this.debounceTimer = null;
        this.apiKey = '0f91b4cca3897c8a5ffcbd73f6061b43';
        this.baseUrl = 'https://api.themoviedb.org/3';
        this.imageBaseUrl = 'https://image.tmdb.org/t/p/w500';
        
        // DOM Elements
        this.searchInput = document.getElementById('searchInput');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.modal = document.getElementById('movieModal');
        this.modalContent = document.getElementById('movieDetailContent');
        this.searchSection = document.getElementById('searchSection');
        this.template = document.getElementById('movieCardTemplate');
        
        // Bind methods
        this.handleSearch = this.handleSearch.bind(this);
        this.handleKeyNav = this.handleKeyNav.bind(this);
        
        this.init();
    }
    
    init() {
        this.searchInput.addEventListener('input', this.handleSearch);
        this.searchInput.addEventListener('keydown', this.handleKeyNav);
        this.setupModal();
        this.showEmptyState();
    }
    
    // Loading state via data attribute
    setLoading(isLoading) {
        if (isLoading) {
            this.searchSection.setAttribute('data-loading', 'true');
        } else {
            this.searchSection.removeAttribute('data-loading');
        }
    }
    
    // Debounced search
    handleSearch() {
        const searchTerm = this.searchInput.value.trim();
        
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        
        if (searchTerm.length === 0) {
            this.showEmptyState();
            return;
        }
        
        this.setLoading(true);
        this.debounceTimer = setTimeout(() => {
            this.searchMovies(searchTerm);
        }, 300);
    }
    
    // Search with cache and AbortController
    async searchMovies(searchTerm) {
        // Check cache
        if (this.searchCache.has(searchTerm)) {
            console.log('📦 Cache hit');
            this.renderResults(this.searchCache.get(searchTerm));
            this.setLoading(false);
            return;
        }
        
        // Cancel previous request
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        
        this.currentAbortController = new AbortController();
        
        try {
            const response = await fetch(
                `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(searchTerm)}`,
                { signal: this.currentAbortController.signal }
            );
            
            if (!response.ok) throw new Error('Search failed');
            
            const data = await response.json();
            this.searchCache.set(searchTerm, data.results);
            this.renderResults(data.results);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Request cancelled');
                return;
            }
            this.showError('Failed to search. Try again.');
        } finally {
            this.setLoading(false);
        }
    }
    
    // Render with Template + DocumentFragment (ONE DOM write)
    renderResults(movies) {
        if (!movies || movies.length === 0) {
            this.showNoResults();
            return;
        }
        
        this.currentResults = movies;
        
        // Use DocumentFragment for performance
        const fragment = new DocumentFragment();
        const grid = document.createElement('div');
        grid.className = 'movies-grid';
        
        movies.slice(0, 12).forEach(movie => {
            const clone = this.template.content.cloneNode(true);
            const poster = clone.querySelector('.movie-poster');
            const title = clone.querySelector('.movie-title');
            const year = clone.querySelector('.movie-year');
            const card = clone.querySelector('.movie-card');
            
            poster.src = movie.poster_path 
                ? this.imageBaseUrl + movie.poster_path 
                : 'https://via.placeholder.com/300x450?text=No+Poster';
            poster.alt = movie.title;
            
            // XSS-safe: textContent, not innerHTML
            title.textContent = movie.title;
            year.textContent = movie.release_date ? new Date(movie.release_date).getFullYear() : 'Unknown';
            
            card.dataset.movieId = movie.id;
            card.addEventListener('click', () => this.showMovieDetails(movie.id));
            
            grid.appendChild(clone);
        });
        
        fragment.appendChild(grid);
        
        // SINGLE DOM write
        this.resultsContainer.innerHTML = '';
        this.resultsContainer.appendChild(fragment);
    }
    
    // XSS-safe highlighting using DOM API
    buildHighlightedTitle(title, query) {
        const container = document.createElement('span');
        
        if (!query || query.length === 0) {
            container.textContent = title;
            return container;
        }
        
        const lowerTitle = title.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const idx = lowerTitle.indexOf(lowerQuery);
        
        if (idx === -1) {
            container.textContent = title;
            return container;
        }
        
        const before = document.createElement('span');
        before.textContent = title.substring(0, idx);
        
        const match = document.createElement('span');
        match.className = 'highlight';
        match.textContent = title.substring(idx, idx + query.length);
        
        const after = document.createElement('span');
        after.textContent = title.substring(idx + query.length);
        
        container.appendChild(before);
        container.appendChild(match);
        container.appendChild(after);
        
        return container;
    }
    
    // Movie details with Promise.allSettled (resilience)
    async showMovieDetails(movieId) {
        this.modal.style.display = 'flex';
        this.modalContent.innerHTML = '<div class="loading-state">Loading...</div>';
        
        // Promise.allSettled - one failure doesn't break others
        const results = await Promise.allSettled([
            fetch(`${this.baseUrl}/movie/${movieId}?api_key=${this.apiKey}`).then(r => r.json()),
            fetch(`${this.baseUrl}/movie/${movieId}/credits?api_key=${this.apiKey}`).then(r => r.json()),
            fetch(`${this.baseUrl}/movie/${movieId}/videos?api_key=${this.apiKey}`).then(r => r.json())
        ]);
        
        this.renderMovieDetails(results);
    }
    
    renderMovieDetails(results) {
        const [detailsResult, creditsResult, videosResult] = results;
        
        if (detailsResult.status !== 'fulfilled') {
            this.modalContent.innerHTML = '<div class="error-state">Failed to load details</div>';
            return;
        }
        
        const details = detailsResult.value;
        const credits = creditsResult.status === 'fulfilled' ? creditsResult.value : { cast: [] };
        const videos = videosResult.status === 'fulfilled' ? videosResult.value : { results: [] };
        
        const cast = credits.cast ? credits.cast.slice(0, 6).map(c => c.name) : [];
        
        // Find trailer (graceful fallback)
        const trailer = videos.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
        
        const rating = details.vote_average ? details.vote_average.toFixed(1) : 'N/A';
        const year = details.release_date ? details.release_date.split('-')[0] : 'Unknown';
        const genres = details.genres ? details.genres.map(g => g.name).join(', ') : 'N/A';
        
        this.modalContent.innerHTML = `
            <div class="modal-movie">
                <img class="modal-poster" src="${details.poster_path ? this.imageBaseUrl + details.poster_path : 'https://via.placeholder.com/300x450?text=No+Poster'}" alt="${this.escapeHtml(details.title)}">
                <div class="modal-info">
                    <h2 class="modal-title">${this.escapeHtml(details.title)}</h2>
                    <div class="modal-rating">⭐ ${rating}/10 · ${year}</div>
                    <p class="modal-overview">${this.escapeHtml(details.overview || 'No description available')}</p>
                    <div class="modal-details">
                        <p><strong>Runtime:</strong> ${details.runtime ? details.runtime + ' min' : 'Unknown'}</p>
                        <p><strong>Genres:</strong> ${genres}</p>
                    </div>
                    <h4>Starring:</h4>
                    <div class="cast-list">
                        ${cast.map(name => `<span class="cast-tag">${this.escapeHtml(name)}</span>`).join('')}
                    </div>
                    ${trailer ? `<button class="watch-btn" onclick="window.open('https://www.youtube.com/watch?v=${trailer.key}', '_blank')">▶ Watch Trailer</button>` : '<p style="color:#888;">No trailer available</p>'}
                </div>
            </div>
        `;
    }
    
    // Keyboard navigation
    handleKeyNav(event) {
        const cards = document.querySelectorAll('.movie-card');
        if (cards.length === 0) return;
        
        let currentIndex = Array.from(cards).findIndex(c => c.classList.contains('active'));
        if (currentIndex === -1) currentIndex = 0;
        
        switch(event.key) {
            case 'ArrowDown':
                event.preventDefault();
                currentIndex = Math.min(currentIndex + 1, cards.length - 1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                currentIndex = Math.max(currentIndex - 1, 0);
                break;
            case 'Enter':
                event.preventDefault();
                const movieId = cards[currentIndex]?.dataset.movieId;
                if (movieId) this.showMovieDetails(movieId);
                return;
            default:
                return;
        }
        
        cards.forEach((c, i) => c.classList.toggle('active', i === currentIndex));
        cards[currentIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    
    // UI States
    showEmptyState() {
        this.resultsContainer.innerHTML = '<div class="empty-state">🔍 Start typing to search for movies</div>';
    }
    
    showNoResults() {
        this.resultsContainer.innerHTML = '<div class="empty-state">😕 No movies found. Try a different search.</div>';
    }
    
    showError(message) {
        this.resultsContainer.innerHTML = `<div class="error-state">❌ ${this.escapeHtml(message)}</div>`;
    }
    
    // Modal setup
    setupModal() {
        const closeBtn = document.querySelector('.close');
        closeBtn?.addEventListener('click', () => {
            this.modal.style.display = 'none';
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.modal.style.display = 'none';
            }
        });
    }
    
    // XSS protection
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Start app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new CineSearchPro();
    console.log('✅ CineSearch Pro ready');
    console.log('📦 Features: Debounce, Cache, AbortController, Promise.allSettled, Template + Fragment');
});