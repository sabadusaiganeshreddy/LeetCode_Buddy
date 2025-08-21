# LeetCode Buddy 🚀

A powerful Chrome extension that enhances your LeetCode experience with advanced analytics, personalized recommendations, and problem insights.

## ✨ Features

### 📊 Profile Analytics
- **Rating Distribution Chart**: Visual breakdown of solved problems by difficulty rating (200-point buckets)
- **Tag Analysis**: Interactive doughnut chart showing your most practiced topics
- **Smart Mode Detection**: Automatically detects if you're viewing your own profile vs. a public profile
- **Comprehensive Data**: Full solved problem history for logged-in users, recent submissions for public profiles

### 🎯 Personalized Recommendations
- **Focus Tags**: AI-powered tag selection based on your solving patterns
- **Interactive Chip Selection**: Click to toggle focus areas and get updated recommendations
- **Difficulty Targeting**: Recommendations calibrated to your median rating
- **Similar Problems**: Find problems with similar patterns and topics

### 🔍 Problem Page Enhancements
- **Instant Rating Display**: See problem difficulty ratings right on the problem page
- **Similar Problem Suggestions**: Discover related problems to practice
- **Progress Tracking**: Visual indicators for solved/unsolved status

### ⚡ Performance Optimizations
- **Intelligent Caching**: Weekly caching of ratings data with dual-source fallback
- **Tag Map Hydration**: Efficient tag data fetching with smart coverage detection
- **Memory Management**: Proper chart instance cleanup to prevent memory leaks
- **Fail-Safe UI**: Graceful handling of missing data with helpful user messages

## 🛠️ Installation

### From Source (Developer Mode)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sabadusaiganeshreddy/LeetCode_Buddy.git
   cd LeetCode_Buddy
   ```

2. **Load in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `leetcode-buddy` folder

3. **Verify Installation**:
   - Visit any LeetCode profile or problem page
   - Look for the new analytics sections and rating badges

## 📁 Project Structure

```
leetcode-buddy/
├── manifest.json          # Extension configuration
├── src/
│   ├── background.js      # Background service worker
│   └── content.js         # Main extension logic
├── styles/
│   └── styles.css         # Extension styling
└── vendor/
    └── chart.umd.min.js   # Chart.js library
```

## 🔧 Technical Details

### Core Technologies
- **Chrome Extension Manifest V3**
- **Chart.js** for data visualization
- **GraphQL & REST APIs** for LeetCode data fetching
- **Chrome Storage API** for caching and preferences

### Data Sources
- Primary: GitHub repository with crowd-sourced problem ratings
- Fallback: CDN mirror for reliability
- LeetCode GraphQL API for user data
- LeetCode REST API as owner-mode fallback

### Smart Features
- **Dual-source fetching**: Automatic failover between data sources
- **Format detection**: Supports both TSV and legacy rating file formats
- **Coverage analysis**: Only fetches full tag map when needed (< 60% coverage)
- **Self-healing UI**: Charts rebuild themselves on data updates

## 🎨 Screenshots

### Profile Analytics
![Profile analytics showing rating distribution and tag charts](https://via.placeholder.com/800x400?text=Profile+Analytics+Screenshot)

### Problem Page Enhancement
![Problem page with rating badge and similar problems](https://via.placeholder.com/800x300?text=Problem+Page+Screenshot)

## 🚀 Usage

### Profile Page
1. Visit any LeetCode profile (your own or others)
2. Scroll down to see the analytics section
3. Interact with focus tag chips to customize recommendations
4. View rating distribution and tag analysis charts

### Problem Page
1. Open any LeetCode problem
2. See the difficulty rating badge
3. Browse similar problem recommendations
4. Track your progress with visual indicators

## 📊 Analytics Explained

### Rating Distribution
Problems are grouped into 200-point buckets (e.g., 1400-1599, 1600-1799) to show your solving pattern across different difficulty levels.

### Focus Tags
The extension automatically identifies your weak areas by finding tags where you have:
- At least 3 solved problems
- Lower coverage ratio compared to other topics

### Recommendations
Problems are suggested based on:
- Your selected focus tags
- Median difficulty rating of your solved problems
- Problems you haven't solved yet
- Topic similarity and learning progression

## 🔒 Privacy & Permissions

### Required Permissions
- `cookies`: Access LeetCode session for authenticated requests
- `storage`: Cache ratings data and user preferences
- `host_permissions`: Access LeetCode domain for data fetching

### Data Handling
- All data processing happens locally in your browser
- No personal information is sent to external servers
- Only public LeetCode data is accessed
- Cache data is stored locally and can be cleared anytime

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and test thoroughly
4. **Commit your changes**: `git commit -m 'Add amazing feature'`
5. **Push to the branch**: `git push origin feature/amazing-feature`
6. **Open a Pull Request**

### Development Setup
```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/LeetCode_Buddy.git
cd LeetCode_Buddy

# Load in Chrome for testing
# No build process required - just load the leetcode-buddy folder
```

## 🐛 Issues & Support

Found a bug or have a feature request? Please [open an issue](https://github.com/sabadusaiganeshreddy/LeetCode_Buddy/issues) with:

- **Bug reports**: Steps to reproduce, expected vs actual behavior, browser version
- **Feature requests**: Clear description of the desired functionality and use case
- **Screenshots**: Visual issues should include screenshots when possible

## 📈 Roadmap

### Upcoming Features
- [ ] Weekly/monthly progress tracking
- [ ] Contest performance analytics
- [ ] Study plan generation
- [ ] Export analytics data
- [ ] Dark/light theme toggle
- [ ] Customizable chart types
- [ ] Problem difficulty prediction
- [ ] Company-specific problem filtering

### Performance Improvements
- [ ] Lazy loading for large datasets
- [ ] Background data sync
- [ ] Offline mode support
- [ ] Mobile-responsive design

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **LeetCode**: For providing the platform and APIs
- **zerotrac/leetcode_problem_rating**: For the community-maintained problem ratings
- **Chart.js**: For the excellent charting library
- **Chrome Extensions Community**: For documentation and best practices

## 📞 Contact

- **Author**: Sabadusaiganeshreddy
- **GitHub**: [@sabadusaiganeshreddy](https://github.com/sabadusaiganeshreddy)
- **Repository**: [LeetCode_Buddy](https://github.com/sabadusaiganeshreddy/LeetCode_Buddy)

---

**⭐ If you find LeetCode Buddy helpful, please star the repository!**

*Happy coding and good luck with your LeetCode journey! 🎯*
