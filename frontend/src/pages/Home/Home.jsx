import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Package, Search, Clock, Shield, TrendingUp, ChevronRight, 
  Truck, MapPin, Users, Star, Phone, Mail, Globe, 
  CheckCircle, ArrowRight, Zap, HeadphonesIcon, Award, Building2,
  Plane, Ship
} from 'lucide-react';
import { shipmentsAPI, pricingAPI } from '../../services/api';
import './Home.css';
import ThemeToggle from '../../components/ThemeToggle';

export default function Home() {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, observerOptions);

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Price calculator state
  const [priceForm, setPriceForm] = useState({
    origin_pincode: '',
    destination_pincode: '',
    weight_kg: '',
    shipment_type: 'parcel',
    service_type: 'standard',
  });
  const [priceResult, setPriceResult] = useState(null);

  const handleTrack = async (e) => {
    e.preventDefault();
    if (!trackingNumber.trim()) return;

    setLoading(true);
    setTrackingError('');
    setTrackingResult(null);

    try {
      const response = await shipmentsAPI.track(trackingNumber.trim());
      setTrackingResult(response.data);
    } catch (error) {
      setTrackingError('Shipment not found. Please check the tracking number.');
    } finally {
      setLoading(false);
    }
  };

  const handlePriceCalc = async (e) => {
    e.preventDefault();
    const weight = parseFloat(priceForm.weight_kg);
    if (isNaN(weight) || weight <= 0) {
      alert('Please enter a valid weight');
      return;
    }

    try {
      const response = await pricingAPI.calculate({
        ...priceForm,
        weight_kg: weight,
      });
      setPriceResult(response.data);
    } catch (error) {
      console.error('Price calculation error:', error);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#f59e0b',
      picked_up: '#3b82f6',
      in_transit: '#6366f1',
      out_for_delivery: '#8b5cf6',
      delivered: '#10b981',
      cancelled: '#ef4444',
      returned: '#6b7280',
    };
    return colors[status] || '#6b7280';
  };

  return (
    <div className="home-page" role="main">
      {/* Hero Section */}
      <header className="hero-section" role="banner">
        <nav className="nav-bar" role="navigation" aria-label="Main navigation">
          <Link to="/" className="logo" aria-label="RR Enterprise Home">
            <Package size={28} />
            <span>RR Enterprise</span>
          </Link>
          <div className="nav-links">
            <a href="#services">Services</a>
            <a href="#pricing">Pricing</a>
            <a href="#features">Features</a>
            <ThemeToggle />
            <Link to="/login" className="btn btn-primary" style={{ padding: '0.6rem 1.25rem' }}>Login</Link>
          </div>

        </nav>

        <div className="hero-content">
          <h1>Reliable Logistics for Your Business</h1>
          <p>Fast, secure, and transparent delivery tracking for all your shipments across India.</p>

          {/* Tracking Form */}
          <form className="tracking-form" onSubmit={handleTrack} id="track" role="search">
            <div className="input-group">
              <Search size={18} />
              <input
                type="text"
                placeholder="Enter tracking number..."
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-accent" disabled={loading}>
              {loading ? 'Tracking...' : 'Track'}
            </button>
          </form>

          {/* Tracking Result */}
          {trackingError && <p className="error-message">{trackingError}</p>}
          {trackingResult && (
            <div className="tracking-result">
              <div className="tracking-header">
                <div>
                  <h3 style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Tracking Number</h3>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{trackingResult.tracking_number}</div>
                </div>
                <span
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(trackingResult.status) }}
                >
                  {trackingResult.status.replace('_', ' ')}
                </span>
              </div>
              <div className="route-info">
                <span>{trackingResult.origin.city}</span>
                <ChevronRight size={16} />
                <span>{trackingResult.destination.city}</span>
              </div>
              <div className="tracking-timeline">
                {trackingResult.tracking_history.slice().reverse().map((event, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="timeline-dot" style={{ backgroundColor: getStatusColor(event.status) }}></div>
                    <div className="timeline-content">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong style={{ color: 'white' }}>{event.status.replace('_', ' ')}</strong>
                        <small>{new Date(event.timestamp).toLocaleString()}</small>
                      </div>
                      <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{event.location}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Stats Counter Section */}
      <section className="stats-section reveal">
        <div className="stats-container">
          <div className="stat-item">
            <div className="stat-icon-wrapper blue">
              <Package size={24} />
            </div>
            <div className="stat-number">50K+</div>
            <div className="stat-label">Delivered</div>
          </div>
          <div className="stat-item">
            <div className="stat-icon-wrapper green">
              <MapPin size={24} />
            </div>
            <div className="stat-number">500+</div>
            <div className="stat-label">Cities</div>
          </div>
          <div className="stat-item">
            <div className="stat-icon-wrapper orange">
              <Users size={24} />
            </div>
            <div className="stat-number">10K+</div>
            <div className="stat-label">Clients</div>
          </div>
          <div className="stat-item">
            <div className="stat-icon-wrapper purple">
              <Star size={24} />
            </div>
            <div className="stat-number">4.9</div>
            <div className="stat-label">Rating</div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="services-section reveal" id="services">
        <div className="section-header">
          <span className="section-tag">Logistics Solutions</span>
          <h2>Our Expertise</h2>
          <p>Sophisticated transport solutions tailored for your business needs.</p>
        </div>
        <div className="services-grid">
          <div className="service-card">
            <div className="service-icon">
              <Plane size={28} />
            </div>
            <h3>Air Freight</h3>
            <p>Fastest worldwide delivery for time-sensitive cargo and high-value goods.</p>
            <ul className="service-features">
              <li><CheckCircle size={14} /> Next-flight out</li>
              <li><CheckCircle size={14} /> Global coverage</li>
            </ul>
          </div>
          <div className="service-card featured">
            <div className="featured-badge">Most Popular</div>
            <div className="service-icon">
              <Truck size={28} />
            </div>
            <h3>Road Transport</h3>
            <p>Reliable nationwide trucking network for partial and full truck loads.</p>
            <ul className="service-features">
              <li><CheckCircle size={14} /> Door-to-door</li>
              <li><CheckCircle size={14} /> Real-time tracking</li>
            </ul>
          </div>
          <div className="service-card">
            <div className="service-icon">
              <Ship size={28} />
            </div>
            <h3>Ocean Cargo</h3>
            <p>Cost-effective international shipping solutions for bulk and heavy consignments.</p>
            <ul className="service-features">
              <li><CheckCircle size={14} /> FCL & LCL options</li>
              <li><CheckCircle size={14} /> Port-to-port</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section reveal" id="features">
        <div className="section-header">
          <h2>Why RR Enterprise</h2>
          <p>Refined processes that prioritize security and transparency above all else.</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <Clock size={32} />
            <h3>Real-time Tracking</h3>
            <p>Sophisticated dashboard for precise shipment monitoring.</p>
          </div>
          <div className="feature-card">
            <Shield size={32} />
            <h3>Secure Custody</h3>
            <p>End-to-end security protocols for high-value cargo.</p>
          </div>
          <div className="feature-card">
            <TrendingUp size={32} />
            <h3>Optimized Rates</h3>
            <p>Performance-based pricing for long-term partners.</p>
          </div>
        </div>
      </section>

      {/* Pricing Calculator Section */}
      <section className="pricing-section" id="pricing">
        <div className="section-header">
          <span className="section-tag">Pricing</span>
          <h2>Get a Quote</h2>
          <p>Calculate shipping costs instantly with our transparent pricing</p>
        </div>
        <div className="pricing-calculator">
          <form onSubmit={handlePriceCalc}>
            <div className="form-row">
              <div className="form-group">
                <label>Origin Pincode</label>
                <input
                  type="text"
                  placeholder="e.g., 110001"
                  value={priceForm.origin_pincode}
                  onChange={(e) => setPriceForm({ ...priceForm, origin_pincode: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Destination Pincode</label>
                <input
                  type="text"
                  placeholder="e.g., 400001"
                  value={priceForm.destination_pincode}
                  onChange={(e) => setPriceForm({ ...priceForm, destination_pincode: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="e.g., 2.5"
                  value={priceForm.weight_kg}
                  onChange={(e) => setPriceForm({ ...priceForm, weight_kg: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Shipment Type</label>
                <select
                  value={priceForm.shipment_type}
                  onChange={(e) => setPriceForm({ ...priceForm, shipment_type: e.target.value })}
                >
                  <option value="document">Document</option>
                  <option value="parcel">Parcel</option>
                  <option value="freight">Freight</option>
                  <option value="express">Express</option>
                </select>
              </div>
              <div className="form-group">
                <label>Service</label>
                <select
                  value={priceForm.service_type}
                  onChange={(e) => setPriceForm({ ...priceForm, service_type: e.target.value })}
                >
                  <option value="standard">Standard</option>
                  <option value="express">Express</option>
                  <option value="overnight">Overnight</option>
                  <option value="same_day">Same Day</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Calculate Price</button>
          </form>

          {priceResult && (
            <div className="price-result">
              <div className="price-header">
                <h3>Estimated Price</h3>
                <span className="zone-badge">{priceResult.zone} Zone</span>
              </div>
              <div className="price-breakdown">
                <div className="price-row">
                  <span>Base Amount</span>
                  <span>₹{priceResult.base_amount}</span>
                </div>
                <div className="price-row">
                  <span>Weight Charges</span>
                  <span>₹{priceResult.weight_charges}</span>
                </div>
                <div className="price-row">
                  <span>Fuel Surcharge</span>
                  <span>₹{priceResult.fuel_surcharge}</span>
                </div>
                <div className="price-row">
                  <span>GST (18%)</span>
                  <span>₹{priceResult.gst_amount}</span>
                </div>
                <div className="price-row total">
                  <span>Total</span>
                  <span>₹{priceResult.total_amount}</span>
                </div>
              </div>
              <p className="delivery-estimate">
                Estimated Delivery: <strong>{priceResult.estimated_days} days</strong>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="testimonials-section">
        <div className="section-header">
          <span className="section-tag">Testimonials</span>
          <h2>What Our Customers Say</h2>
          <p>Trusted by thousands of businesses across India</p>
        </div>
        <div className="testimonials-grid">
          <div className="testimonial-card">
            <div className="testimonial-content">
              <div className="stars">
                {[...Array(5)].map((_, i) => <Star key={i} size={18} fill="#f59e0b" color="#f59e0b" />)}
              </div>
              <p>"RR Enterprise has transformed our logistics. Their tracking system is excellent and deliveries are always on time. Highly recommended!"</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">RS</div>
              <div className="author-info">
                <strong>Rahul Sharma</strong>
                <span>E-commerce Owner, Delhi</span>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="testimonial-content">
              <div className="stars">
                {[...Array(5)].map((_, i) => <Star key={i} size={18} fill="#f59e0b" color="#f59e0b" />)}
              </div>
              <p>"Best B2B logistics partner we've worked with. Their API integration was seamless and the support team is incredibly responsive."</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">PM</div>
              <div className="author-info">
                <strong>Priya Mehta</strong>
                <span>Operations Manager, Mumbai</span>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="testimonial-content">
              <div className="stars">
                {[...Array(5)].map((_, i) => <Star key={i} size={18} fill="#f59e0b" color="#f59e0b" />)}
              </div>
              <p>"Reliable service with competitive pricing. We've reduced our logistics costs by 30% since switching to RR Enterprise."</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">AK</div>
              <div className="author-info">
                <strong>Amit Kumar</strong>
                <span>Retailer, Bangalore</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section reveal">
        <div className="cta-content">
          <h2>Ship with Excellence.</h2>
          <p>Experience the most reliable logistics network for your business operations.</p>
        </div>
      </section>

      {/* Footer */}
      <div className="moving-truck-container">
        <div className="moving-truck">
          <Truck size={32} />
          <div className="speed-lines"></div>
        </div>
      </div>

      <footer className="footer reveal">
        <div className="footer-content">
          <div className="footer-grid">
            <div className="footer-brand-section">
              <div className="footer-brand">
                <Package size={24} />
                <span>RR Logistix</span>
              </div>
              <p>Redefining reliability in Indian logistics through technology and precision.</p>
              <div className="social-links">
                <a href="#" className="social-link"><Globe size={18} /></a>
                <a href="#" className="social-link"><Mail size={18} /></a>
                <a href="#" className="social-link"><Phone size={18} /></a>
              </div>
            </div>
            
            <div className="footer-links">
              <h4>Platform</h4>
              <a href="#track">Tracking</a>
              <a href="#pricing">Pricing</a>
              <a href="#services">Services</a>
            </div>
            
            <div className="footer-contact">
              <h4>Office</h4>
              <div className="contact-item">India Operations Centre</div>
              <div className="contact-item">Mumbai, Maharashtra</div>
              <div className="contact-item">+91 98765 43210</div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 RR Enterprise. Reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
