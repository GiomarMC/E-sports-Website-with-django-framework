from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from esports.tests.factories import (
    AdminGameFactory, SiteSettingsFactory, TournamentFactory,
    confirmed_registrations,
)


class TeamPaginationTestCase(APITestCase):
    """Lists of teams come 20 per page; only admins can ask for more."""

    def setUp(self):
        SiteSettingsFactory()
        assignment = AdminGameFactory()
        self.admin = assignment.admin
        self.tournament = TournamentFactory(game=assignment.game)
        self.teams = confirmed_registrations(
            self.tournament, 25, status='confirmed'
        )
        self.participants_url = reverse(
            'tournaments-participants',
            kwargs={'pk': self.tournament.public_id},
        )

    def test_participants_come_in_pages_of_20(self):
        # Act
        first = self.client.get(self.participants_url)
        second = self.client.get(self.participants_url, {'page': 2})

        # Assert
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['count'], 25)
        self.assertEqual(len(first.data['results']), 20)
        self.assertIsNotNone(first.data['next'])
        self.assertEqual(len(second.data['results']), 5)
        self.assertIsNone(second.data['next'])
        ids = [r['id'] for r in first.data['results'] + second.data['results']]
        self.assertEqual(sorted(ids), sorted(t.public_id for t in self.teams))

    def test_visitors_cannot_ask_for_bigger_pages(self):
        # Act
        response = self.client.get(
            self.participants_url, {'page_size': 500}
        )

        # Assert
        self.assertEqual(len(response.data['results']), 20)

    def test_admins_can_ask_for_every_team(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.get(
            self.participants_url, {'page_size': 500}
        )

        # Assert
        self.assertEqual(len(response.data['results']), 25)

    def test_admin_registrations_list_is_paginated(self):
        # Arrange
        self.client.force_authenticate(user=self.admin)

        # Act
        response = self.client.get(
            reverse('registrations-list'), {'page': 2}
        )

        # Assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 25)
        self.assertEqual(len(response.data['results']), 5)

    def test_page_out_of_range_returns_404(self):
        # Act
        response = self.client.get(self.participants_url, {'page': 9})

        # Assert
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
