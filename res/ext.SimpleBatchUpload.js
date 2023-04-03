/**
 * File containing the SimpleBatchUpload class
 *
 * @copyright (C) 2016 - 2017, Stephan Gambke
 * @license   GNU General Public License, version 2 (or any later version)
 *
 * This software is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <http://www.gnu.org/licenses/>.
 *
 * @file
 * @ingroup SimpleBatchUpload
 */

/** global: mediaWiki */
/** global: jQuery */

;( function ( $, mw, undefined ) {

	'use strict';

	$( function () {

		var filesLimitPerBatchConfig = mw.config.get( 'simpleBatchUploadMaxFilesPerBatch' ),
			userGroups = mw.config.get( 'wgUserGroups' ),
			userUploadLimit = 0,
			uploadCount = 0,
			filesUploaded = [];

		if ( filesLimitPerBatchConfig ) {
			$.each( filesLimitPerBatchConfig, function ( role, limit ) {
				if ( userGroups.indexOf( role ) !== -1 && ( limit > userUploadLimit ) ) {
					userUploadLimit = limit;
				}
			} );
		}
		
		var bMobile =   // will be true if running on a mobile device
		navigator.userAgent.indexOf( "Mobile" ) !== -1 || 
		navigator.userAgent.indexOf( "iPhone" ) !== -1 || 
		navigator.userAgent.indexOf( "Android" ) !== -1 || 
		navigator.userAgent.indexOf( "Windows Phone" ) !== -1 ;
		if (!bMobile) $('.fileupload-camera').hide(); //hide camera upload on desktop

		function uuidv4() {
			return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
				(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
			);
		}

		$( 'div.fileupload-container' ).each( function () {

			var container = this;

			$( 'input.fileupload', container ).each( function () {
			$(this)
			.on( 'change drop', function ( /* e, data */ ) { $( 'ul.fileupload-results', container ).empty(); } )

			.fileupload( {
				dataType: 'json',
				dropZone:  $(this).closest( '.fileupload-dropzone' ), //select not all but the nearest dropzone
				progressInterval: 100,

				add: function ( e, data ) {

					var that = this;

					if ( data.originalFiles.length > userUploadLimit ) {
						window.alert( mw.msg( 'simplebatchupload-max-files-alert', userUploadLimit ) );
						return false;
					}

					data.id = Date.now();

					var src_filename = data.files[ 0 ].name;
					var filenode_text = src_filename;
					//var dst_filename = src_filename
					var dst_filename = "OSW" + uuidv4().replaceAll("-","");// + src_filename.split(".")[src_filename.split(".").length - 1]
					var textdata = $(container).find('[name="wfUploadDescription"]').val();
					// It matches:
					//   other| +rename = !(\w+)[ -_/]*! =$1-}}
					// where:
					//   what: (\w+)[ -_/]*
					//   with: $1-
					// Spaces are important in subst-pattern (after 2nd '=').
					var rename_regex = /\|\s*\+rename\s*=\s*([#\/@!])(.+)\1([gimuy]{0,5})\s*-->(.*?)(?=\||}}\s*$)/;
					var match = rename_regex.exec(textdata);
					if ( match ) {
						var pattern = RegExp(match[2], match[3]);
						var replace = match[4];
						dst_filename = src_filename.replace(pattern, replace);
						filenode_text = ( dst_filename == src_filename ) ?
							src_filename : `${src_filename} --> ${dst_filename}`;
					}
					
					var status = $( '<li>' )
					.attr( 'id', data.id )
					.text( filenode_text )
					.data('filenode_text', filenode_text);

					$( 'ul.fileupload-results', container ).append( status );

					var api = new mw.Api();

					var tokenType = 'csrf';

					if ( mw.config.get( 'wgVersion' ) < '1.27.0' ) {
						tokenType = 'edit';
					}

					// invalidate cached token; always request a new one
					api.badToken( tokenType );

					api.getToken( tokenType )
					.then(
						function ( token ) {

							data.formData = {
								format: 'json',
								action: 'upload',
								token: token,
								ignorewarnings: 1,
								text: textdata.replace(rename_regex, ''),
								comment: $( that ).fileupload( 'option', 'comment' ),
								filename: dst_filename
							};

							data.submit()
							.success( function ( result /*, textStatus, jqXHR */ ) {
								uploadCount += 1;
								if ( result.error !== undefined ) {

									status.text( status.text() + " ERROR: " + result.error.info ).addClass( 'ful-error api-error' );

								} else {
									var link = $( '<a>' );
									link
									.attr( 'href', mw.Title.newFromFileName( result.upload.filename ).getUrl() )
									.text( status.data('filenode_text') );

									status
									.addClass( 'ful-success' )
									.text( ' OK' )
									.prepend( link );
									console.log("Upload " + uploadCount + "/" + data.originalFiles.length);
									var suffix = src_filename.split(".")[src_filename.split(".").length-1]; //e.g. ".png"
									var file_label = src_filename.replace("." + suffix, "");
									filesUploaded.push({exists: false, name: result.upload.filename, label: file_label})
									mw.hook( 'simplebatchupload.file.uploaded' ).fire({exists: false, name: result.upload.filename, label: file_label});
								}
								if (uploadCount === data.originalFiles.length) {
									mw.hook( 'simplebatchupload.files.uploaded' ).fire({files: filesUploaded});
									uploadCount = 0;
									filesUploaded = [];
								}

							} )
							.error( function ( /* jqXHR, textStatus, errorThrown */ ) {
								uploadCount += 1;
								if (uploadCount === data.originalFiles.length) {
									mw.hook( 'simplebatchupload.files.uploaded' ).fire({files: filesUploaded});
									uploadCount = 0;
									filesUploaded = [];
								}
								status.text( status.text() + " ERROR: Server communication failed." ).addClass( 'ful-error server-error' );
								// console.log( JSON.stringify( arguments ) );
							} );
						},
						function () {
							status.text( status.text() + " ERROR: Could not get token." ).addClass( 'ful-error token-error' );
							// console.log( JSON.stringify( arguments ) );
						}
					);

				},

				progress: function ( e, data ) {
					if ( data.loaded !== data.total ) {
						var status = $( '#' + data.id );
						status.text( status.data('filenode_text') + ' ' + parseInt( data.loaded / data.total * 100, 10 ) + '%' );
					}
				}
			} );
			} );
		} );

		$( document ).bind( 'drop dragover', function ( e ) {
			e.preventDefault();
		} );
	} );

}( jQuery, mediaWiki ));
