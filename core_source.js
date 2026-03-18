// app.js
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
                this.selectMovie(this.currentResults[index]);
            }
        });
    }
    
    // Set loading state using data attribute
    setLoading(isLoading) {
        this.searchContainer.setAttribute('data-loading', isLoading);
    }
    
    // Debounce implementation
    handleSearchInput(event) {
        const searchTerm = event.target.value.trim();
        
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
        // Check cache first
        if (this.searchCache.has(searchTerm)) {
            this.currentResults = this.searchCache.get(searchTerm);
            this.renderResults(this.currentResults);
            return;
        }
        
        // Cancel any in-flight request
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        
        // Create new abort controller for this request
        this.currentAbortController = new AbortController();
        
        try {
            this.setLoading(true);
            
            const response = await fetch(
                `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(searchTerm)}`,
                { signal: this.currentAbortController.signal }
            );
            
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache the results
            this.searchCache.set(searchTerm, data.results);
            this.currentResults = data.results;
            
            // Render results using Fragment pattern
            this.renderResults(data.results);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Previous search cancelled');
                return;
            }
            console.error('Search error:', error);
            this.showError('Failed to fetch movies. Please try again.');
        } finally {
            this.setLoading(false);
            this.currentAbortController = null;
        }
    }
    
    // Render results using DocumentFragment and template
    renderResults(results) {
        // Clear previous results
        this.resultsList.innerHTML = '';
        
        if (results.length === 0) {
            this.showError('No movies found');
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
                this.searchInput.value.trim()
            );
            titleElement.appendChild(highlightedTitle);
            
            // Year (XSS safe - textContent)
            if (movie.release_date) {
                yearElement.textContent = new Date(movie.release_date).getFullYear();
            }
            
            fragment.appendChild(clone);
        });
        
        // Single DOM write
        this.resultsList.appendChild(fragment);
        
        // Reset selected index
        this.selectedIndex = -1;
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
        this.resultsList.innerHTML = '';
        this.currentResults = [];
        this.selectedIndex = -1;
    }
    
    // Show error message
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        this.resultsList.appendChild(errorDiv);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    new CineSearchPro();
});

// Add these methods to the CineSearchPro class

async fetchMovieDetails(movieId) {
    const urls = [
        `${this.baseUrl}/movie/${movieId}?api_key=${this.apiKey}`,           // Details
        `${this.baseUrl}/movie/${movieId}/credits?api_key=${this.apiKey}`,  // Credits
        `${this.baseUrl}/movie/${movieId}/videos?api_key=${this.apiKey}`    // Videos
    ];
    
    // For testing resilience - you can deliberately break one URL
    // Uncomment this line to test error resilience:
    // urls[1] = urls[1] + 'broken'; // Break the credits endpoint
    
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

renderMovieDetails([detailsResult, creditsResult, videosResult]) {
    // Clear previous details
    this.movieDetails.innerHTML = '';
    
    // Clone template
    const clone = this.detailTemplate.content.cloneNode(true);
    const detailsSection = clone.getElementById('detailsSection');
    const creditsSection = clone.getElementById('creditsSection');
    const videosSection = clone.getElementById('videosSection');
    
    // Handle Details (required - if this fails, show error)
    if (detailsResult.status === 'fulfilled') {
        const details = detailsResult.value;
        detailsSection.innerHTML = `
            <h3>${details.title}</h3>
            <p>${details.overview || 'No overview available'}</p>
            <p>Release Date: ${details.release_date || 'Unknown'}</p>
            <p>Rating: ${details.vote_average ? details.vote_average.toFixed(1) : 'N/A'}/10</p>
        `;
    } else {
        detailsSection.classList.add('error');
        detailsSection.innerHTML = '<p class="error-message">Failed to load movie details</p>';
    }
    
    // Handle Credits (resilient)
    if (creditsResult.status === 'fulfilled') {
        const credits = creditsResult.value;
        const cast = credits.cast?.slice(0, 5).map(c => c.name).join(', ') || 'No cast info';
        const director = credits.crew?.find(c => c.job === 'Director')?.name || 'Unknown';
        
        creditsSection.innerHTML = `
            <h4>Cast & Crew</h4>
            <p><strong>Director:</strong> ${director}</p>
            <p><strong>Cast:</strong> ${cast}</p>
        `;
    } else {
        creditsSection.classList.add('error');
        creditsSection.innerHTML = '<p class="error-message">Failed to load credits</p>';
    }
    
    // Handle Videos (resilient)
    if (videosResult.status === 'fulfilled') {
        const videos = videosResult.value;
        const trailer = videos.results?.find(v => v.type === 'Trailer');
        
        videosSection.innerHTML = `
            <h4>Videos</h4>
            ${trailer 
                ? `<p>Trailer: ${trailer.name}</p>
                   <a href="https://www.youtube.com/watch?v=${trailer.key}" target="_blank">
                      Watch Trailer
                   </a>`
                : '<p>No videos available</p>'
            }
        `;
    } else {
        videosSection.classList.add('error');
        videosSection.innerHTML = '<p class="error-message">Failed to load videos</p>';
    }
    
    this.movieDetails.appendChild(clone);
}

showDetailError(message) {
    this.movieDetails.innerHTML = `<div class="error-message">${message}</div>`;
}

// Update selectMovie method to fetch details
selectMovie(movie) {
    if (!movie) return;
    
    // Remove active class from all results
    Array.from(this.resultsList.children).forEach(child => {
        child.classList.remove('active');
    });
    
    // Add active class to selected movie
    const selectedElement = this.resultsList.children[this.selectedIndex];
    if (selectedElement) {
        selectedElement.classList.add('active');
    }
    
    // Fetch and display movie details with concurrent requests
    this.fetchMovieDetails(movie.id);
}