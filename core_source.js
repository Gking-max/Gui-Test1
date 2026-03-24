// app.js - Complete CineSearch Pro Application

class CineSearchPro {
    constructor() {
        // State management
        this.searchCache = new Map();  // Cache for search results
        this.currentAbortController = null;
        this.debounceTimer = null;
        this.selectedIndex = -1;
        this.currentResults = [];
        this.currentSearchTerm = '';
        
        // API Configuration
        this.apiKey = 'YOUR_TMDB_API_KEY'; // Replace with your actual key
        this.baseUrl = 'https://api.themoviedb.org/3';
        this.imageBaseUrl = 'https://image.tmdb.org/t/p/w200';
        
        // Validate API key
        if (this.apiKey === 'YOUR_TMDB_API_KEY') {
            console.warn('⚠️ Please add your TMDB API key to use this application');
            this.showPersistentError('API key not configured. Please add your TMDB API key to use the search feature.');
        }
        
        // DOM Elements
        this.searchInput = document.getElementById('searchInput');
        this.resultsList = document.getElementById('resultsList');
        this.movieDetails = document.getElementById('movieDetails');
        this.searchContainer = document.querySelector('.search-container');
        this.resultTemplate = document.getElementById('movieResultTemplate');
        this.detailTemplate = document.getElementById('movieDetailTemplate');
        
        // Bind methods to maintain 'this' context
        this.handleSearchInput = this.handleSearchInput.bind(this);
        this.handleKeyNavigation = this.handleKeyNavigation.bind(this);
        this.selectMovie = this.selectMovie.bind(this);
        
        // Initialize
        this.init();
    }
    
    init() {
        // Event listeners
        this.searchInput.addEventListener('input', this.handleSearchInput);
        this.searchInput.addEventListener('keydown', this.handleKeyNavigation);
        this.resultsList.addEventListener('click', (e) => {
            const movieItem = e.target.closest('.movie-result');
            if (movieItem) {
                const index = Array.from(this.resultsList.children).indexOf(movieItem);
                if (this.currentResults[index]) {
                    this.selectMovie(this.currentResults[index]);
                }
            }
        });
        
        // Focus search input on page load
        this.searchInput.focus();
    }
    
    // Set loading state using data attribute
    setLoading(isLoading) {
        this.searchContainer.setAttribute('data-loading', isLoading);
    }
    
    // Debounce implementation
    handleSearchInput(event) {
        const searchTerm = event.target.value.trim();
        this.currentSearchTerm = searchTerm;
        
        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        // Don't search for empty strings
        if (searchTerm.length === 0) {
            this.clearResults();
            return;
        }
        
        // Set debounce timer
        this.debounceTimer = setTimeout(() => {
            this.performSearch(searchTerm);
        }, 300);
    }
    
    // Main search function with cache and abort controller
    async performSearch(searchTerm) {
        const normalizedTerm = searchTerm.toLowerCase().trim();
        
        // Check cache first with normalized key
        if (this.searchCache.has(normalizedTerm)) {
            console.log('📦 Cache hit for:', normalizedTerm);
            this.currentResults = this.searchCache.get(normalizedTerm);
            this.renderResults(this.currentResults, searchTerm);
            return;
        }
        
        console.log('🌐 Fetching from API for:', normalizedTerm);
        
        // Cancel any in-flight request
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
        
        // Create new abort controller for this request
        this.currentAbortController = new AbortController();
        const controller = this.currentAbortController;
        
        try {
            this.setLoading(true);
            
            const response = await fetch(
                `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(searchTerm)}`,
                { signal: controller.signal }
            );
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status} - ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Store with normalized key
            this.searchCache.set(normalizedTerm, data.results);
            this.currentResults = data.results;
            
            // Render results using Fragment pattern
            this.renderResults(data.results, searchTerm);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('🔴 Search cancelled for:', normalizedTerm);
                return;
            }
            console.error('Search error:', error);
            this.showError(`Failed to fetch movies: ${error.message}`);
        } finally {
            if (this.currentAbortController === controller) {
                this.setLoading(false);
                this.currentAbortController = null;
            }
        }
    }
    
    // Render results using DocumentFragment and template
    renderResults(results, searchTerm) {
        // Clear previous results
        this.clearResultsList();
        
        if (results.length === 0) {
            this.showNoResults();
            return;
        }
        
        // Create fragment
        const fragment = new DocumentFragment();
        
        results.forEach(movie => {
            // Clone template
            const clone = this.resultTemplate.content.cloneNode(true);
            const movieElement = clone.querySelector('.movie-result');
            const titleElement = clone.querySelector('.movie-title');
            const yearElement = clone.querySelector('.movie-year');
            
            // Set data attribute for movie ID
            movieElement.dataset.movieId = movie.id;
            
            // XSS-safe title with highlighting
            const highlightedTitle = this.buildHighlightedTitle(
                movie.title, 
                searchTerm
            );
            
            // Clear and append title
            titleElement.innerHTML = '';
            titleElement.appendChild(highlightedTitle);
            
            // Year (XSS safe - textContent)
            if (movie.release_date) {
                yearElement.textContent = new Date(movie.release_date).getFullYear();
            } else {
                yearElement.textContent = 'Year unknown';
            }
            
            fragment.appendChild(clone);
        });
        
        // Single DOM write
        this.resultsList.appendChild(fragment);
        
        // Reset selected index
        this.selectedIndex = -1;
    }
    
    // Clear results list safely
    clearResultsList() {
        while (this.resultsList.firstChild) {
            this.resultsList.removeChild(this.resultsList.firstChild);
        }
    }
    
    // Show no results message
    showNoResults() {
        const noResultsDiv = document.createElement('div');
        noResultsDiv.className = 'empty-state';
        noResultsDiv.textContent = 'No movies found. Try a different search term.';
        this.resultsList.appendChild(noResultsDiv);
    }
    
    // XSS-safe highlighting using DOM API only
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
        
        // Create before text (XSS safe - textContent)
        const before = document.createElement('span');
        before.textContent = title.substring(0, idx);
        
        // Create highlighted match (XSS safe - textContent)
        const match = document.createElement('span');
        match.className = 'highlight';
        match.textContent = title.substring(idx, idx + query.length);
        
        // Create after text (XSS safe - textContent)
        const after = document.createElement('span');
        after.textContent = title.substring(idx + query.length);
        
        container.appendChild(before);
        container.appendChild(match);
        container.appendChild(after);
        
        return container;
    }
    
    // Clear results
    clearResults() {
        this.clearResultsList();
        this.currentResults = [];
        this.selectedIndex = -1;
    }
    
    // Show error message (XSS safe)
    showError(message) {
        this.clearResultsList();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        this.resultsList.appendChild(errorDiv);
    }
    
    // Show persistent error for API key
    showPersistentError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.margin = '20px';
        errorDiv.style.textAlign = 'center';
        document.querySelector('.container').prepend(errorDiv);
    }
    
    // Fetch movie details with concurrent requests
    async fetchMovieDetails(movieId) {
        // Show loading state
        this.movieDetails.innerHTML = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.textContent = 'Loading movie details';
        this.movieDetails.appendChild(loadingDiv);
        
        const urls = [
            `${this.baseUrl}/movie/${movieId}?api_key=${this.apiKey}`,           // Details
            `${this.baseUrl}/movie/${movieId}/credits?api_key=${this.apiKey}`,  // Credits
            `${this.baseUrl}/movie/${movieId}/videos?api_key=${this.apiKey}`    // Videos
        ];
        
        // For testing resilience - uncomment to test error handling
        // urls[1] = urls[1] + '/broken'; // This will break the credits endpoint
        
        try {
            // Use Promise.allSettled for resilience
            const results = await Promise.allSettled(
                urls.map(url => fetch(url).then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                }))
            );
            
            this.renderMovieDetails(results);
            
        } catch (error) {
            console.error('Error fetching details:', error);
            this.showDetailError('Failed to load movie details');
        }
    }
    
    // Render movie details (XSS safe)
    renderMovieDetails(results) {
        const [detailsResult, creditsResult, videosResult] = results;
        
        // Clear previous details
        this.movieDetails.innerHTML = '';
        
        // Clone template
        const clone = this.detailTemplate.content.cloneNode(true);
        
        // Get sections (use querySelector for fragments)
        const detailsSection = clone.querySelector('#detailsSection');
        const creditsSection = clone.querySelector('#creditsSection');
        const videosSection = clone.querySelector('#videosSection');
        
        // Clear sections
        detailsSection.innerHTML = '';
        creditsSection.innerHTML = '';
        videosSection.innerHTML = '';
        
        // Handle Details (XSS-safe)
        if (detailsResult.status === 'fulfilled') {
            const details = detailsResult.value;
            
            // Build details DOM safely
            const title = document.createElement('h3');
            title.textContent = details.title;
            
            // Add poster if available (XSS safe - using background-image)
            if (details.poster_path) {
                const poster = document.createElement('div');
                poster.style.cssText = `
                    width: 100%;
                    height: 200px;
                    background-image: url(${this.imageBaseUrl}${details.poster_path});
                    background-size: cover;
                    background-position: center;
                    border-radius: 8px;
                    margin-bottom: 15px;
                `;
                detailsSection.appendChild(poster);
            }
            
            const overview = document.createElement('p');
            overview.textContent = details.overview || 'No overview available';
            
            const releaseDate = document.createElement('p');
            releaseDate.innerHTML = '<strong>Release Date:</strong> ';
            releaseDate.appendChild(document.createTextNode(details.release_date || 'Unknown'));
            
            const rating = document.createElement('p');
            rating.innerHTML = '<strong>Rating:</strong> ';
            rating.appendChild(document.createTextNode(
                details.vote_average ? `${details.vote_average.toFixed(1)}/10` : 'N/A'
            ));
            
            detailsSection.appendChild(title);
            detailsSection.appendChild(overview);
            detailsSection.appendChild(releaseDate);
            detailsSection.appendChild(rating);
            
        } else {
            detailsSection.classList.add('error');
            const errorMsg = document.createElement('p');
            errorMsg.className = 'error-message';
            errorMsg.textContent = 'Failed to load movie details';
            detailsSection.appendChild(errorMsg);
        }
        
        // Handle Credits (XSS-safe)
        if (creditsResult.status === 'fulfilled') {
            const credits = creditsResult.value;
            const cast = credits.cast?.slice(0, 5).map(c => c.name).join(', ') || 'No cast info';
            const director = credits.crew?.find(c => c.job === 'Director')?.name || 'Unknown';
            
            const title = document.createElement('h4');
            title.textContent = 'Cast & Crew';
            
            const directorPara = document.createElement('p');
            directorPara.innerHTML = '<strong>Director:</strong> ';
            directorPara.appendChild(document.createTextNode(director));
            
            const castPara = document.createElement('p');
            castPara.innerHTML = '<strong>Cast:</strong> ';
            castPara.appendChild(document.createTextNode(cast));
            
            creditsSection.appendChild(title);
            creditsSection.appendChild(directorPara);
            creditsSection.appendChild(castPara);
            
        } else {
            creditsSection.classList.add('error');
            const errorMsg = document.createElement('p');
            errorMsg.className = 'error-message';
            errorMsg.textContent = 'Failed to load credits';
            creditsSection.appendChild(errorMsg);
        }
        
        // Handle Videos (XSS-safe)
        if (videosResult.status === 'fulfilled') {
            const videos = videosResult.value;
            const trailer = videos.results?.find(v => v.type === 'Trailer');
            
            const title = document.createElement('h4');
            title.textContent = 'Videos';
            videosSection.appendChild(title);
            
            if (trailer) {
                const trailerPara = document.createElement('p');
                trailerPara.textContent = `Trailer: ${trailer.name}`;
                
                const link = document.createElement('a');
                link.href = `https://www.youtube.com/watch?v=${trailer.key}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'Watch Trailer';
                
                videosSection.appendChild(trailerPara);
                videosSection.appendChild(link);
            } else {
                const noVideos = document.createElement('p');
                noVideos.textContent = 'No videos available';
                videosSection.appendChild(noVideos);
            }
            
        } else {
            videosSection.classList.add('error');
            const errorMsg = document.createElement('p');
            errorMsg.className = 'error-message';
            errorMsg.textContent = 'Failed to load videos';
            videosSection.appendChild(errorMsg);
        }
        
        this.movieDetails.appendChild(clone);
    }
    
    // Show detail error (XSS safe)
    showDetailError(message) {
        this.movieDetails.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        this.movieDetails.appendChild(errorDiv);
    }
    
    // Select and display movie details
    selectMovie(movie) {
        if (!movie) return;
        
        // Find and highlight the selected movie in results
        const allResults = Array.from(this.resultsList.children);
        const selectedIndex = this.currentResults.findIndex(m => m.id === movie.id);
        
        // Remove active class from all results
        allResults.forEach(result => {
            result.classList.remove('active');
            result.removeAttribute('aria-selected');
        });
        
        // Add active class to the selected movie
        if (selectedIndex !== -1) {
            allResults[selectedIndex].classList.add('active');
            allResults[selectedIndex].setAttribute('aria-selected', 'true');
            this.selectedIndex = selectedIndex;
        }
        
        // Fetch and display movie details
        this.fetchMovieDetails(movie.id);
    }
    
    // Handle keyboard navigation
    handleKeyNavigation(event) {
        const results = Array.from(this.resultsList.children).filter(
            child => child.classList.contains('movie-result')
        );
        
        if (results.length === 0) return;
        
        switch(event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, results.length - 1);
                this.updateSelectedResult(results);
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.updateSelectedResult(results);
                break;
                
            case 'Enter':
                event.preventDefault();
                if (this.selectedIndex >= 0 && this.selectedIndex < results.length) {
                    const movieId = results[this.selectedIndex].dataset.movieId;
                    const movie = this.currentResults.find(m => m.id == movieId);
                    if (movie) {
                        this.selectMovie(movie);
                    }
                }
                break;
                
            case 'Escape':
                this.clearResults();
                this.searchInput.value = '';
                this.searchInput.focus();
                break;
        }
    }
    
    // Update selected result styling
    updateSelectedResult(results) {
        // Remove all active classes and aria-selected
        results.forEach(result => {
            result.classList.remove('active');
            result.removeAttribute('aria-selected');
        });
        
        // Add active class to selected
        if (this.selectedIndex >= 0 && this.selectedIndex < results.length) {
            const selected = results[this.selectedIndex];
            selected.classList.add('active');
            selected.setAttribute('aria-selected', 'true');
            
            // Scroll into view if needed
            selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
    
    // Clear cache (utility method for debugging)
    clearCache() {
        this.searchCache.clear();
        console.log('🗑️ Cache cleared');
        this.showError('Cache cleared. Next search will fetch from API.');
        setTimeout(() => {
            if (this.resultsList.children.length === 0) {
                this.clearResultsList();
            }
        }, 2000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.cineSearch = new CineSearchPro();
    
    // Add cache clear shortcut for testing (Ctrl+Shift+C)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            if (window.cineSearch) {
                window.cineSearch.clearCache();
            }
        }
    });
    
    console.log('🎬 CineSearch Pro initialized');
    console.log('💡 Tip: Press Ctrl+Shift+C to clear cache');
    console.log('🔧 For testing: Uncomment the broken URL in fetchMovieDetails() to test resilience');
});